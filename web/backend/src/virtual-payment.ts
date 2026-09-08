import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { assertAdmin, AuthGuard, AuthRequest } from './auth';
import { config } from './config';
import { PrismaService } from './prisma.service';
import { decryptSecret, encryptSecret } from './secrets';
import { ZodPipe } from './zod.pipe';
import { WechatAccessService } from './wechat-access';
import { parseWechatPush, decryptWechatPush } from './wechat-push';

const orderSchema = z.object({ planId: z.string().uuid(), quantity: z.number().int().min(1).max(100) });
const configSchema = z.object({
  appId: z.string().trim().min(1).max(64),
  offerId: z.string().trim().min(1).max(64),
  appKey: z.string().trim().min(1).max(512).optional(),
  pushToken: z.string().trim().min(1).max(256).optional(),
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

function canDecryptSecret(value: string | null | undefined) {
  if (!value) return false;
  try { return decryptSecret(value).length > 0; }
  catch { return false; }
}

function requiredSecret(value: string, label: string) {
  try {
    const decrypted = decryptSecret(value);
    if (decrypted) return decrypted;
  } catch {
    // Convert encryption-key drift and malformed ciphertext into an actionable client error.
  }
  throw new BadRequestException(`虚拟支付${label}无法解密，请管理员重新填写并保存`);
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

  constructor(private readonly prisma: PrismaService, private readonly wechat: WechatAccessService) {}

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
    const reserved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`virtual:${request.user.id}:${plan.id}`})) IS NULL AS acquired`;
      const existing=await tx.virtualPaymentOrder.findFirst({where:{userId:request.user.id,planId:plan.id,quantity:body.quantity,status:'PENDING',expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'}});
      if(existing)return {order:existing,reused:true};
      const order = await tx.virtualPaymentOrder.create({ data: {
      id: orderId,
      userId: request.user.id,
      planId: plan.id,
      outTradeNo,
      openid: request.user.miniOpenid!,
      productId: plan.productId,
      quantity: body.quantity,
      membershipDays: plan.membershipDays,
      messageQuota: plan.messageQuota,
      amountFen: plan.priceFen * body.quantity,
      attach: orderId,
      expiresAt,
      } });
      return {order,reused:false};
    });
    return this.checkout(request, reserved.order.id, reserved.reused);
  }

  async checkout(request: AuthRequest, id: string, check = true) {
    if (check) await this.query(request, id, true);
    const order=await this.prisma.virtualPaymentOrder.findFirst({where:{id,userId:request.user.id},include:{plan:true}});
    if(!order)throw new NotFoundException('订单不存在');
    if(order.status!=='PENDING'||order.expiresAt<=new Date())throw new BadRequestException('订单已支付或已过期，请查看订单记录');
    const payment=await this.paymentConfig();
    if(!payment.enabled)throw new BadRequestException('虚拟支付暂未启用');
    if(!request.user.miniSessionKeyEncrypted||request.user.miniOpenid!==order.openid)throw new BadRequestException('请重新微信登录后支付');
    const plan=order.plan;
    const signData = JSON.stringify({
      offerId: payment.offerId,
      buyQuantity: order.quantity,
      env: 0,
      currencyType: 'CNY',
      productId: order.productId,
      goodsPrice: order.amountFen / order.quantity,
      outTradeNo: order.outTradeNo,
      attach: order.attach,
    });
    const appKey = requiredSecret(payment.encryptedAppKey, ' AppKey');
    const sessionKey = decryptSecret(request.user.miniSessionKeyEncrypted);
    return {
      id: order.id,
      outTradeNo: order.outTradeNo,
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

  async query(request: AuthRequest, id: string, force = false) {
    const order = await this.prisma.virtualPaymentOrder.findFirst({ where: { id, userId: request.user.id }, include: { plan: true } });
    if (!order) throw new NotFoundException('虚拟支付订单不存在');
    const claimed = await this.prisma.virtualPaymentOrder.updateMany({ where: { id, OR: [{queriedAt:null},{queriedAt:{lt:new Date(Date.now()-5000)}}] }, data: { queriedAt:new Date() } });
    if (!claimed.count && !force) return this.publicOrder(order);
    const payment = await this.paymentConfig();
    const accessToken = await this.wechat.token();
    const body = JSON.stringify({ openid: order.openid, env: 0, order_id: order.outTradeNo });
    const paySig = signHmac(requiredSecret(payment.encryptedAppKey, ' AppKey'), `/xpay/query_order&${body}`);
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
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM virtual_payment_orders WHERE id=${order.id}::uuid FOR UPDATE`;
        await tx.virtualPaymentOrder.update({where:{id:order.id},data:{status:'REFUNDED',queriedAt:new Date(),notifyRaw:result as Prisma.InputJsonValue}});
        await tx.membershipGrant.updateMany({where:{source:'WECHAT_VIRTUAL',sourceOrderId:order.id,expiresAt:{gt:new Date()}},data:{expiresAt:new Date()}});
      });
    } else if (status === 6) {
      await this.prisma.virtualPaymentOrder.updateMany({ where: { id: order.id, status:'PENDING' }, data: { status: VirtualPaymentOrderStatus.CLOSED, queriedAt: new Date(), notifyRaw: result as Prisma.InputJsonValue } });
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
    const expected = query.msg_signature
      ? sha1([token, timestamp, nonce, echostr].sort().join(''))
      : sha1([token, timestamp, nonce].sort().join(''));
    if (!sameText(query.signature || query.msg_signature, expected)) throw new BadRequestException('虚拟支付推送签名无效');
    return query.msg_signature && payment.encryptedEncodingAesKey ? decryptWechatPush(echostr, requiredSecret(payment.encryptedEncodingAesKey, ' EncodingAESKey'), payment.appId) : echostr;
  }

  async notify(request: Request, response: Response) {
    const payment = await this.paymentConfig();
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
    if (!rawBody) throw new BadRequestException('虚拟支付推送内容为空');
    const inner = parseWechatPush(rawBody, request.query as Record<string,string>, { token: payment.pushToken, appId:payment.appId, mode:payment.messageMode, aesKey:payment.encryptedEncodingAesKey?requiredSecret(payment.encryptedEncodingAesKey, ' EncodingAESKey'):undefined });
    const info=nested(inner,'WeChatPayInfo'), goods=nested(inner,'GoodsInfo');
    const notify:VirtualNotify={event:pick(inner,'Event'),openid:pick(inner,'OpenId'),outTradeNo:pick(inner,'OutTradeNo'),wxOrderId:pick(info,'MchOrderNo')||pick(inner,'MchOrderNo'),productId:pick(goods,'ProductId'),quantity:Number(pick(goods,'Quantity'))||undefined,raw:inner};
    if (notify.event === 'xpay_refund_notify' && notify.outTradeNo) {
      const order=await this.prisma.virtualPaymentOrder.findUnique({where:{outTradeNo:notify.outTradeNo}});
      if(order) await this.query({user:{id:order.userId}} as AuthRequest,order.id);
    } else if (notify.event !== 'xpay_goods_deliver_notify') {
      response.type('application/xml');
      return xmlResponse(true);
    }
    if (notify.event === 'xpay_goods_deliver_notify') {
      if (!notify.outTradeNo || !notify.openid || !notify.productId || !notify.quantity) throw new BadRequestException('虚拟支付推送缺少订单信息');
      await this.deliverByNotify(notify);
    }
    if (payment.dataFormat === 'JSON') { response.type('application/json'); return { errcode: 0, errmsg: 'success' }; }
    response.type('application/xml');
    return xmlResponse(true);
  }

  async adminConfig() {
    const current = await this.prisma.virtualPaymentConfig.findUnique({ where: { id: 'default' } });
    return current ? {
      id: current.id, appId: current.appId, offerId: current.offerId,
      hasPushToken: Boolean(current.pushToken), hasAppKey: Boolean(current.encryptedAppKey), appKeyUsable: canDecryptSecret(current.encryptedAppKey),
      hasEncodingAesKey: Boolean(current.encryptedEncodingAesKey), encodingAesKeyUsable: canDecryptSecret(current.encryptedEncodingAesKey), messageMode: current.messageMode,
      dataFormat: current.dataFormat, env: current.env, notifyUrl: current.notifyUrl, enabled: current.enabled,
    } : null;
  }

  async saveAdminConfig(body: z.infer<typeof configSchema>) {
    const current = await this.prisma.virtualPaymentConfig.findUnique({ where: { id: 'default' } });
    if(body.appId !== config().WECHAT_MINI_APPID)throw new BadRequestException('支付 AppID 必须与服务端微信登录 AppID 一致');
    if(current && (body.appId!==current.appId || body.offerId!==current.offerId))throw new BadRequestException('已有支付商户不能直接替换 AppID/OfferID，以免历史订单无法查单');
    if (!body.appKey && !current) throw new BadRequestException('首次保存必须填写 AppKey');
    if (!body.pushToken && !current) throw new BadRequestException('首次保存必须填写推送 Token');
    if (body.messageMode !== 'PLAINTEXT' && !body.encodingAesKey && !current?.encryptedEncodingAesKey) {
      throw new BadRequestException('兼容或安全模式必须配置 EncodingAESKey');
    }
    const encryptedAppKey = body.appKey ? encryptSecret(body.appKey) : current?.encryptedAppKey;
    const pushToken = body.pushToken || current?.pushToken;
    const encryptedEncodingAesKey = body.encodingAesKey
      ? encryptSecret(body.encodingAesKey)
      : body.encodingAesKey === null
        ? null
        : current?.encryptedEncodingAesKey ?? null;
    if (!encryptedAppKey || !pushToken) throw new BadRequestException('AppKey 和推送 Token 配置不完整');
    return this.prisma.virtualPaymentConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default', appId: body.appId, offerId: body.offerId, encryptedAppKey, pushToken,
        encryptedEncodingAesKey, messageMode: body.messageMode, dataFormat: body.dataFormat,
        env: 0, notifyUrl: body.notifyUrl || null, enabled: body.enabled,
      },
      update: {
        appId: body.appId, offerId: body.offerId, encryptedAppKey, pushToken,
        encryptedEncodingAesKey, messageMode: body.messageMode, dataFormat: body.dataFormat,
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

  private async deliverByNotify(notify: VirtualNotify) {
    const order = await this.prisma.virtualPaymentOrder.findUnique({ where: { outTradeNo: notify.outTradeNo! } });
    if (!order) throw new NotFoundException('虚拟支付订单不存在');
    if (notify.productId && notify.productId !== order.productId) throw new BadRequestException('虚拟支付商品不匹配');
    if (notify.openid && notify.openid !== order.openid) throw new BadRequestException('虚拟支付用户不匹配');
    if (notify.quantity !== undefined && notify.quantity !== order.quantity) throw new BadRequestException('虚拟支付商品数量不匹配');
    if (!notify.wxOrderId) throw new BadRequestException('虚拟支付推送缺少平台订单号');
    // Plaintext URL signatures do not bind the body: independently query WeChat before granting.
    const verified=await this.query({user:{id:order.userId}} as AuthRequest,order.id,true);
    if(verified.status!=='DELIVERED')throw new BadRequestException('微信尚未确认支付，请重试推送');
  }

  private async deliver(id: string, notify: VirtualNotify) {
    if(!notify.wxOrderId)throw new BadRequestException('微信查单未返回平台订单号');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM virtual_payment_orders WHERE id=${id}::uuid FOR UPDATE`;
      const order = await tx.virtualPaymentOrder.findUnique({ where: { id }, include: { plan: true } });
      if (!order) throw new NotFoundException('虚拟支付订单不存在');
      if (order.status === VirtualPaymentOrderStatus.DELIVERED) return;
      if (order.status === VirtualPaymentOrderStatus.CLOSED || order.status === VirtualPaymentOrderStatus.REFUNDED) return;
      const now = new Date();
      await tx.membershipGrant.upsert({
        where: { source_sourceOrderId: { source: MembershipGrantSource.WECHAT_VIRTUAL, sourceOrderId: order.id } },
        create: {
          userId: order.userId, planId: order.planId, source: MembershipGrantSource.WECHAT_VIRTUAL, sourceOrderId: order.id,
          quantity: order.quantity, quotaTotal: (order.messageQuota ?? order.plan.messageQuota) * order.quantity, startsAt: now,
          expiresAt: new Date(now.getTime() + (order.membershipDays ?? order.plan.membershipDays) * order.quantity * 86_400_000),
        },
        update: {},
      });
      await tx.virtualPaymentOrder.update({ where: { id: order.id }, data: {
        wxOrderId: notify.wxOrderId || order.wxOrderId, status: VirtualPaymentOrderStatus.DELIVERED,
        paidAt: order.paidAt || now, deliveredAt: now, queriedAt: now, notifyRaw: notify.raw as Prisma.InputJsonValue,
      } });
    });
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
  @Post('orders/:id/checkout') checkout(@Req() request: AuthRequest, @Param('id') id: string) { return this.payment.checkout(request, id); }

  @UseGuards(AuthGuard)
  @Get('entitlements') entitlements(@Req() request: AuthRequest) { return this.payment.entitlements(request); }

  @Get('notify') verify(@Query() query: Record<string, string | undefined>) { return this.payment.verifyUrl(query); }

  @HttpCode(200) @Post('notify') notify(@Req() request: Request, @Res({ passthrough: true }) response: Response) { return this.payment.notify(request, response); }
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
