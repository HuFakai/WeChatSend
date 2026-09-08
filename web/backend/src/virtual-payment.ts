import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { MembershipGrantSource, Prisma, VirtualPaymentOrderStatus } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import { createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { assertAdmin, AuthGuard, AuthRequest } from './auth';
import { config } from './config';
import { PrismaService } from './prisma.service';
import { decryptSecret, encryptSecret } from './secrets';
import { ZodPipe } from './zod.pipe';

const orderSchema = z.object({ planId: z.string().uuid(), quantity: z.number().int().min(1).max(100) });
const configSchema = z.object({
  appId: z.string().trim().min(1).max(64),
  offerId: z.string().trim().min(1).max(64),
  appKey: z.string().trim().min(1).max(512).optional(),
  pushToken: z.string().trim().min(1).max(256),
  encodingAesKey: z.string().trim().max(512).optional().nullable(),
  messageMode: z.enum(['PLAINTEXT', 'COMPATIBLE', 'SECURE']).default('PLAINTEXT'),
  dataFormat: z.enum(['XML', 'JSON']).default('XML'),
  env: z.literal(0).default(0),
  notifyUrl: z.string().url().max(1000).optional().nullable(),
  enabled: z.boolean().default(false),
});
const planSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/),
  name: z.string().trim().min(1).max(100),
  productId: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  priceFen: z.number().int().min(1).max(10_000_000),
  membershipDays: z.number().int().min(1).max(3650),
  messageQuota: z.number().int().min(0).max(10_000_000),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  isActive: z.boolean().default(true),
});
const patchPlanSchema = planSchema.partial();

type VirtualNotify = {
  event?: string;
  openid?: string;
  outTradeNo?: string;
  wxOrderId?: string;
  productId?: string;
  quantity?: number;
  raw: unknown;
};

function signHmac(key: string, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function sha1(value: string) {
  return createHash('sha1').update(value, 'utf8').digest('hex');
}

function sameText(left: string | undefined, right: string) {
  if (!left) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function asString(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function unwrapXml(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const root = record.xml ?? record.XML;
  return root && typeof root === 'object' && !Array.isArray(root) ? root as Record<string, unknown> : record;
}

function pick(record: Record<string, unknown>, key: string) {
  const target = key.toLowerCase();
  const direct = Object.entries(record).find(([name]) => name.toLowerCase() === target)?.[1];
  return asString(direct);
}

function nested(record: Record<string, unknown>, key: string) {
  const target = key.toLowerCase();
  const value = Object.entries(record).find(([name]) => name.toLowerCase() === target)?.[1];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function xmlResponse(ok: boolean) {
  return ok ? '<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>' : '<xml><ErrCode>1</ErrCode><ErrMsg><![CDATA[failed]]></ErrMsg></xml>';
}

@Injectable()
export class VirtualPaymentService {
  private readonly parser = new XMLParser({ ignoreAttributes: true, trimValues: true, parseTagValue: false });

  constructor(private readonly prisma: PrismaService) {}

  async plans() {
    return this.prisma.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceFen: 'asc' }],
      select: { id: true, code: true, name: true, productId: true, description: true, priceFen: true, membershipDays: true, messageQuota: true },
    });
  }

  async createOrder(request: AuthRequest, body: z.infer<typeof orderSchema>) {
    const payment = await this.paymentConfig();
    if (!payment.enabled) throw new BadRequestException('小程序虚拟支付尚未启用');
    if (!request.user.miniOpenid || !request.user.miniSessionKeyEncrypted) throw new BadRequestException('请先在小程序重新登录以获取支付授权');
    const plan = await this.prisma.membershipPlan.findFirst({ where: { id: body.planId, isActive: true } });
    if (!plan) throw new NotFoundException('会员套餐不存在或已下架');

    const orderId = randomUUID();
    const outTradeNo = `W${Date.now().toString(36)}${randomBytes(6).toString('hex')}`.slice(0, 32);
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const order = await this.prisma.virtualPaymentOrder.create({ data: {
      id: orderId,
      userId: request.user.id,
      planId: plan.id,
      outTradeNo,
      openid: request.user.miniOpenid,
      productId: plan.productId,
      quantity: body.quantity,
      amountFen: plan.priceFen * body.quantity,
      attach: orderId,
      expiresAt,
    } });

    const signData = JSON.stringify({
      offerId: payment.offerId,
      buyQuantity: order.quantity,
      env: 0,
      currencyType: 'CNY',
      productId: order.productId,
      goodsPrice: plan.priceFen,
      outTradeNo: order.outTradeNo,
      attach: order.attach,
    });
    const appKey = decryptSecret(payment.encryptedAppKey);
    const sessionKey = decryptSecret(request.user.miniSessionKeyEncrypted);
    return {
      id: order.id,
      status: order.status,
      expiresAt: order.expiresAt,
      plan: { id: plan.id, name: plan.name, description: plan.description, priceFen: plan.priceFen, quantity: order.quantity, amountFen: order.amountFen },
      payData: {
        mode: 'short_series_goods',
        signData,
        paySig: signHmac(appKey, `requestVirtualPayment&${signData}`),
        signature: signHmac(sessionKey, signData),
      },
    };
  }

  async detail(request: AuthRequest, id: string) {
    const order = await this.prisma.virtualPaymentOrder.findFirst({
      where: { id, userId: request.user.id },
      include: { plan: { select: { name: true, description: true, priceFen: true, membershipDays: true, messageQuota: true } } },
    });
    if (!order) throw new NotFoundException('虚拟支付订单不存在');
    return this.publicOrder(order);
  }

  async entitlements(request: AuthRequest) {
    return this.prisma.membershipGrant.findMany({
      where: { userId: request.user.id, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
      include: { plan: { select: { name: true, description: true } } },
    });
  }

  async query(request: AuthRequest, id: string) {
    const order = await this.prisma.virtualPaymentOrder.findFirst({ where: { id, userId: request.user.id }, include: { plan: true } });
    if (!order) throw new NotFoundException('虚拟支付订单不存在');
    if (order.status === VirtualPaymentOrderStatus.DELIVERED) return this.publicOrder(order);
    const payment = await this.paymentConfig();
    const accessToken = await this.accessToken();
    const body = JSON.stringify({ openid: order.openid, env: 0, order_id: order.outTradeNo });
    const paySig = signHmac(decryptSecret(payment.encryptedAppKey), `/xpay/query_order&${body}`);
    const url = new URL('https://api.weixin.qq.com/xpay/query_order');
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('pay_sig', paySig);
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(15_000) });
    const result = await response.json() as { errcode?: number; errmsg?: string; order?: { status?: number; wx_order_id?: string; paid_time?: number } };
    if (!response.ok || (result.errcode && result.errcode !== 0)) throw new BadRequestException(`虚拟支付查单失败：${result.errmsg || response.status}`);
    const status = result.order?.status;
    if (status === 2 || status === 3 || status === 4) {
      await this.deliver(order.id, { openid: order.openid, outTradeNo: order.outTradeNo, wxOrderId: result.order?.wx_order_id, productId: order.productId, quantity: order.quantity, raw: result });
    } else if (status === 5) {
      await this.prisma.virtualPaymentOrder.update({ where: { id: order.id }, data: { status: VirtualPaymentOrderStatus.REFUNDED, queriedAt: new Date(), notifyRaw: result as Prisma.InputJsonValue } });
    } else if (status === 6) {
      await this.prisma.virtualPaymentOrder.update({ where: { id: order.id }, data: { status: VirtualPaymentOrderStatus.CLOSED, queriedAt: new Date(), notifyRaw: result as Prisma.InputJsonValue } });
    } else {
      await this.prisma.virtualPaymentOrder.update({ where: { id: order.id }, data: { queriedAt: new Date(), notifyRaw: result as Prisma.InputJsonValue } });
    }
    return this.detail(request, id);
  }

  async verifyUrl(query: Record<string, string | undefined>) {
    const payment = await this.paymentConfig();
    const token = payment.pushToken;
    const timestamp = query.timestamp;
    const nonce = query.nonce;
    const echostr = query.echostr;
    if (!token || !timestamp || !nonce || !echostr) throw new BadRequestException('虚拟支付推送校验参数不完整');
    if (!sameText(query.signature || query.msg_signature, sha1([token, timestamp, nonce].sort().join('')))) throw new BadRequestException('虚拟支付推送签名无效');
    return echostr;
  }

  async notify(request: Request, response: Response) {
    const payment = await this.paymentConfig();
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
    if (!rawBody) throw new BadRequestException('虚拟支付推送内容为空');
    const notify = this.parseNotify(rawBody, payment);
    if (notify.event && notify.event !== 'xpay_goods_deliver_notify') {
      response.type('application/xml');
      return xmlResponse(true);
    }
    if (!notify.outTradeNo || !notify.openid) throw new BadRequestException('虚拟支付推送缺少订单信息');
    await this.deliverByNotify(notify);
    if (payment.dataFormat === 'JSON') { response.type('application/json'); return { errcode: 0, errmsg: 'success' }; }
    response.type('application/xml');
    return xmlResponse(true);
  }

  async adminConfig() {
    const current = await this.prisma.virtualPaymentConfig.findUnique({ where: { id: 'default' } });
    return current ? {
      id: current.id, appId: current.appId, offerId: current.offerId, pushToken: current.pushToken,
      hasAppKey: true, hasEncodingAesKey: Boolean(current.encryptedEncodingAesKey), messageMode: current.messageMode,
      dataFormat: current.dataFormat, env: current.env, notifyUrl: current.notifyUrl, enabled: current.enabled,
    } : null;
  }

  async saveAdminConfig(body: z.infer<typeof configSchema>) {
    const current = await this.prisma.virtualPaymentConfig.findUnique({ where: { id: 'default' } });
    if (!body.appKey && !current) throw new BadRequestException('首次保存必须填写 AppKey');
    if (body.messageMode !== 'PLAINTEXT' && !body.encodingAesKey && !current?.encryptedEncodingAesKey) {
      throw new BadRequestException('兼容或安全模式必须配置 EncodingAESKey');
    }
    return this.prisma.virtualPaymentConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default', appId: body.appId, offerId: body.offerId, encryptedAppKey: encryptSecret(body.appKey!), pushToken: body.pushToken,
        encryptedEncodingAesKey: body.encodingAesKey ? encryptSecret(body.encodingAesKey) : null, messageMode: body.messageMode, dataFormat: body.dataFormat,
        env: 0, notifyUrl: body.notifyUrl || null, enabled: body.enabled,
      },
      update: {
        appId: body.appId, offerId: body.offerId, ...(body.appKey ? { encryptedAppKey: encryptSecret(body.appKey) } : {}), pushToken: body.pushToken,
        ...(body.encodingAesKey ? { encryptedEncodingAesKey: encryptSecret(body.encodingAesKey) } : {}), messageMode: body.messageMode, dataFormat: body.dataFormat,
        env: 0, notifyUrl: body.notifyUrl || null, enabled: body.enabled,
      },
    }).then(() => this.adminConfig());
  }

  async adminPlans() {
    return this.prisma.membershipPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async createPlan(body: z.infer<typeof planSchema>) {
    try { return await this.prisma.membershipPlan.create({ data: body }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('套餐编码已存在'); throw error; }
  }

  async updatePlan(id: string, body: z.infer<typeof patchPlanSchema>) {
    try { return await this.prisma.membershipPlan.update({ where: { id }, data: body }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('套餐不存在'); throw error; }
  }

  private async paymentConfig() {
    const current = await this.prisma.virtualPaymentConfig.findUnique({ where: { id: 'default' } });
    if (!current) throw new BadRequestException('管理员尚未配置小程序虚拟支付');
    return current;
  }

  private publicOrder(order: { id: string; status: VirtualPaymentOrderStatus; outTradeNo: string; amountFen: number; expiresAt: Date; paidAt: Date | null; deliveredAt: Date | null; queriedAt: Date | null; plan?: { name: string; description: string; priceFen: number; membershipDays?: number; messageQuota?: number } }) {
    return { id: order.id, status: order.status, outTradeNo: order.outTradeNo, amountFen: order.amountFen, expiresAt: order.expiresAt, paidAt: order.paidAt, deliveredAt: order.deliveredAt, queriedAt: order.queriedAt, plan: order.plan };
  }

  private parseNotify(rawBody: string, payment: { pushToken: string; encryptedEncodingAesKey: string | null; messageMode: string; dataFormat: string }): VirtualNotify {
    if (payment.dataFormat === 'JSON' || rawBody.trimStart().startsWith('{')) {
      const value = JSON.parse(rawBody) as Record<string, unknown>;
      const info = nested(value, 'WeChatPayInfo');
      const goods = nested(value, 'GoodsInfo');
      return { event: pick(value, 'Event'), openid: pick(value, 'OpenId'), outTradeNo: pick(value, 'OutTradeNo'), wxOrderId: pick(info, 'MchOrderNo') || pick(value, 'MchOrderNo'), productId: pick(goods, 'ProductId'), quantity: Number(pick(goods, 'Quantity') || 0) || undefined, raw: value };
    }
    const parsed = unwrapXml(this.parser.parse(rawBody));
    const timestamp = pick(parsed, 'TimeStamp') || pick(parsed, 'timestamp');
    const nonce = pick(parsed, 'Nonce') || pick(parsed, 'nonce');
    const msgSignature = pick(parsed, 'MsgSignature') || pick(parsed, 'Signature') || pick(parsed, 'signature');
    const encrypted = pick(parsed, 'Encrypt');
    let inner = parsed;
    if (encrypted) {
      if (!timestamp || !nonce || !msgSignature || !payment.encryptedEncodingAesKey) throw new BadRequestException('安全模式推送参数不完整');
      if (!sameText(msgSignature, sha1([payment.pushToken, timestamp, nonce, encrypted].sort().join('')))) throw new BadRequestException('虚拟支付推送签名无效');
      const decrypted = this.decryptMessage(encrypted, decryptSecret(payment.encryptedEncodingAesKey));
      inner = unwrapXml(this.parser.parse(decrypted));
    } else if (msgSignature && timestamp && nonce && !sameText(msgSignature, sha1([payment.pushToken, timestamp, nonce, rawBody].sort().join('')))) {
      throw new BadRequestException('虚拟支付推送签名无效');
    }
    const info = nested(inner, 'WeChatPayInfo');
    const goods = nested(inner, 'GoodsInfo');
    return { event: pick(inner, 'Event'), openid: pick(inner, 'OpenId'), outTradeNo: pick(inner, 'OutTradeNo'), wxOrderId: pick(info, 'MchOrderNo') || pick(inner, 'MchOrderNo'), productId: pick(goods, 'ProductId'), quantity: Number(pick(goods, 'Quantity') || 0) || undefined, raw: inner };
  }

  private decryptMessage(encrypted: string, encodingAesKey: string) {
    const key = Buffer.from(`${encodingAesKey}=`, 'base64');
    const iv = key.subarray(0, 16);
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
    const length = decrypted.readUInt32BE(16);
    return decrypted.subarray(20, 20 + length).toString('utf8');
  }

  private async deliverByNotify(notify: VirtualNotify) {
    const order = await this.prisma.virtualPaymentOrder.findUnique({ where: { outTradeNo: notify.outTradeNo! } });
    if (!order) throw new NotFoundException('虚拟支付订单不存在');
    if (notify.productId && notify.productId !== order.productId) throw new BadRequestException('虚拟支付商品不匹配');
    await this.deliver(order.id, notify);
  }

  private async deliver(id: string, notify: VirtualNotify) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.virtualPaymentOrder.findUnique({ where: { id }, include: { plan: true } });
      if (!order) throw new NotFoundException('虚拟支付订单不存在');
      if (order.status === VirtualPaymentOrderStatus.DELIVERED) return;
      if (order.status === VirtualPaymentOrderStatus.CLOSED || order.status === VirtualPaymentOrderStatus.REFUNDED) return;
      const now = new Date();
      await tx.membershipGrant.upsert({
        where: { source_sourceOrderId: { source: MembershipGrantSource.WECHAT_VIRTUAL, sourceOrderId: order.id } },
        create: {
          userId: order.userId, planId: order.planId, source: MembershipGrantSource.WECHAT_VIRTUAL, sourceOrderId: order.id,
          quantity: order.quantity, quotaTotal: order.plan.messageQuota * order.quantity, startsAt: now,
          expiresAt: new Date(now.getTime() + order.plan.membershipDays * 86_400_000),
        },
        update: {},
      });
      await tx.virtualPaymentOrder.update({ where: { id: order.id }, data: {
        wxOrderId: notify.wxOrderId || order.wxOrderId, status: VirtualPaymentOrderStatus.DELIVERED,
        paidAt: order.paidAt || now, deliveredAt: now, queriedAt: now, notifyRaw: notify.raw as Prisma.InputJsonValue,
      } });
    });
  }

  private async accessToken() {
    const cfg = config();
    if (!cfg.WECHAT_MINI_APPID || !cfg.WECHAT_MINI_SECRET) throw new BadRequestException('服务端未配置微信小程序 AppID/Secret');
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential'); url.searchParams.set('appid', cfg.WECHAT_MINI_APPID); url.searchParams.set('secret', cfg.WECHAT_MINI_SECRET);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const result = await response.json() as { access_token?: string; errmsg?: string };
    if (!response.ok || !result.access_token) throw new BadRequestException(`获取微信 access_token 失败：${result.errmsg || '未知错误'}`);
    return result.access_token;
  }
}

@Controller('virtual-payment')
export class VirtualPaymentController {
  constructor(private readonly payment: VirtualPaymentService) {}

  @Get('plans') plans() { return this.payment.plans(); }

  @UseGuards(AuthGuard)
  @Post('orders') order(@Req() request: AuthRequest, @Body(new ZodPipe(orderSchema)) body: z.infer<typeof orderSchema>) { return this.payment.createOrder(request, body); }

  @UseGuards(AuthGuard)
  @Get('orders/:id') detail(@Req() request: AuthRequest, @Param('id') id: string) { return this.payment.detail(request, id); }

  @UseGuards(AuthGuard)
  @Post('orders/:id/query') query(@Req() request: AuthRequest, @Param('id') id: string) { return this.payment.query(request, id); }

  @UseGuards(AuthGuard)
  @Get('entitlements') entitlements(@Req() request: AuthRequest) { return this.payment.entitlements(request); }

  @Get('notify') verify(@Query() query: Record<string, string | undefined>) { return this.payment.verifyUrl(query); }

  @Post('notify') notify(@Req() request: Request, @Res({ passthrough: true }) response: Response) { return this.payment.notify(request, response); }
}

@Controller('admin/virtual-payment')
@UseGuards(AuthGuard)
export class VirtualPaymentAdminController {
  constructor(private readonly payment: VirtualPaymentService) {}

  @Get('config') config(@Req() request: AuthRequest) { assertAdmin(request); return this.payment.adminConfig(); }

  @Patch('config') saveConfig(@Req() request: AuthRequest, @Body(new ZodPipe(configSchema)) body: z.infer<typeof configSchema>) { assertAdmin(request); return this.payment.saveAdminConfig(body); }

  @Get('plans') plans(@Req() request: AuthRequest) { assertAdmin(request); return this.payment.adminPlans(); }

  @Post('plans') createPlan(@Req() request: AuthRequest, @Body(new ZodPipe(planSchema)) body: z.infer<typeof planSchema>) { assertAdmin(request); return this.payment.createPlan(body); }

  @Patch('plans/:id') updatePlan(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(patchPlanSchema)) body: z.infer<typeof patchPlanSchema>) { assertAdmin(request); return this.payment.updatePlan(id, body); }
}
