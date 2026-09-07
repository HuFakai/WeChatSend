import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { createDecipheriv, createHash, createPrivateKey, createPublicKey, createSign, createVerify, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { config } from './config';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const orderSchema = z.object({ amountFen: z.number().int().min(1).max(10_000_000), description: z.string().trim().min(1).max(127) });

type PaymentParams = { appId: string; timeStamp: string; nonceStr: string; package: string; signType: 'RSA'; paySign: string };

function pem(value: string) { return value.replace(/\\n/g, '\n'); }

@Injectable()
export class WechatPayService {
  constructor(private readonly prisma: PrismaService) {}

  async createQrOrder(body: z.infer<typeof orderSchema>) {
    this.assertConfigured('qr');
    const sceneToken = randomBytes(12).toString('hex');
    const order = await this.prisma.paymentOrder.create({ data: {
      sceneToken,
      outTradeNo: `WS${Date.now()}${randomBytes(4).toString('hex')}`.slice(0, 32),
      description: body.description,
      amountFen: body.amountFen,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    } });
    const accessToken = await this.accessToken();
    const response = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scene: sceneToken, page: 'pages/pay/index', check_path: false, env_version: config().WECHAT_MINI_ENV_VERSION }),
      signal: AbortSignal.timeout(15_000),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!response.ok || response.headers.get('content-type')?.includes('application/json')) {
      let message = '生成小程序二维码失败';
      try { const data = JSON.parse(buffer.toString()) as { errmsg?: string }; message = data.errmsg || message; } catch { /* binary error body */ }
      throw new BadRequestException(message);
    }
    return { id: order.id, sceneToken, description: order.description, amountFen: order.amountFen, expiresAt: order.expiresAt, qrDataUrl: `data:image/png;base64,${buffer.toString('base64')}` };
  }

  async scan(sceneToken: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { sceneToken } });
    if (!order || order.expiresAt <= new Date() || order.status !== PaymentStatus.PENDING) throw new NotFoundException('付款订单不存在、已过期或已完成');
    return { id: order.id, sceneToken: order.sceneToken, description: order.description, amountFen: order.amountFen, expiresAt: order.expiresAt, status: order.status };
  }

  async checkout(request: AuthRequest, orderId: string) {
    this.assertConfigured('pay');
    if (!request.user.miniOpenid) throw new BadRequestException('请先在小程序完成微信身份授权');
    const order = await this.prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order || order.expiresAt <= new Date() || order.status !== PaymentStatus.PENDING) throw new BadRequestException('付款订单不存在、已过期或已完成');
    const updated = await this.prisma.paymentOrder.update({ where: { id: order.id }, data: { userId: request.user.id, openid: request.user.miniOpenid } });
    const result = await this.signedRequest('/v3/pay/transactions/jsapi', {
      appid: config().WECHAT_MINI_APPID,
      mchid: config().WECHAT_PAY_MCH_ID,
      description: updated.description,
      out_trade_no: updated.outTradeNo,
      time_expire: updated.expiresAt.toISOString(),
      notify_url: config().WECHAT_PAY_NOTIFY_URL,
      amount: { total: updated.amountFen, currency: 'CNY' },
      payer: { openid: request.user.miniOpenid },
    });
    if (!result.prepay_id) throw new BadRequestException('微信支付未返回 prepay_id');
    await this.prisma.paymentOrder.update({ where: { id: order.id }, data: { prepayId: result.prepay_id } });
    return this.paymentParams(result.prepay_id);
  }

  async list(request: AuthRequest) {
    return this.prisma.paymentOrder.findMany({ where: { userId: request.user.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, description: true, amountFen: true, status: true, outTradeNo: true, expiresAt: true, createdAt: true, updatedAt: true } });
  }

  async detail(request: AuthRequest, orderId: string) {
    const order = await this.prisma.paymentOrder.findFirst({
      where: { id: orderId, userId: request.user.id },
      select: { id: true, description: true, amountFen: true, status: true, outTradeNo: true, expiresAt: true, createdAt: true, updatedAt: true },
    });
    if (!order) throw new NotFoundException('付款订单不存在');
    return order;
  }

  async notify(request: Request) {
    this.assertConfigured('notify');
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});
    this.verifyNotify(request, rawBody);
    const envelope = request.body as { resource?: { algorithm?: string; ciphertext?: string; nonce?: string; associated_data?: string } };
    if (envelope.resource?.algorithm !== 'AEAD_AES_256_GCM' || !envelope.resource.ciphertext || !envelope.resource.nonce) throw new BadRequestException('微信支付回调资源格式无效');
    const plaintext = this.decryptNotify(envelope.resource.ciphertext, envelope.resource.nonce, envelope.resource.associated_data || '');
    const payload = JSON.parse(plaintext) as { out_trade_no?: string; transaction_id?: string; trade_state?: string; success_time?: string; payer?: { openid?: string } };
    if (!payload.out_trade_no) throw new BadRequestException('微信支付回调缺少商户订单号');
    const success = payload.trade_state === 'SUCCESS';
    await this.prisma.paymentOrder.updateMany({ where: { outTradeNo: payload.out_trade_no, status: PaymentStatus.PENDING }, data: {
      status: success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
      transactionId: payload.transaction_id,
      openid: payload.payer?.openid,
      notifyAt: new Date(),
      notifyRaw: payload,
    } });
    return { code: 'SUCCESS', message: '成功' };
  }

  private assertConfigured(stage: 'qr' | 'pay' | 'notify') {
    const cfg = config();
    const common = cfg.WECHAT_MINI_APPID && cfg.WECHAT_MINI_SECRET;
    if (!common) throw new BadRequestException('未配置 WECHAT_MINI_APPID/WECHAT_MINI_SECRET');
    if (stage === 'qr') return;
    if (!cfg.WECHAT_PAY_MCH_ID || !cfg.WECHAT_PAY_SERIAL_NO || !cfg.WECHAT_PAY_PRIVATE_KEY || !cfg.WECHAT_PAY_NOTIFY_URL) throw new BadRequestException('未完整配置微信支付商户参数');
    if (stage === 'notify' && (!cfg.WECHAT_PAY_API_V3_KEY || !cfg.WECHAT_PAY_PLATFORM_CERT)) throw new BadRequestException('未完整配置微信支付回调验签参数');
  }

  private async accessToken() {
    const cfg = config();
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential'); url.searchParams.set('appid', cfg.WECHAT_MINI_APPID!); url.searchParams.set('secret', cfg.WECHAT_MINI_SECRET!);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await response.json() as { access_token?: string; errmsg?: string };
    if (!response.ok || !data.access_token) throw new BadRequestException(`获取微信 access_token 失败：${data.errmsg || '未知错误'}`);
    return data.access_token;
  }

  private async signedRequest(path: string, payload: Record<string, unknown>) {
    const cfg = config();
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString('hex');
    const signature = createSign('RSA-SHA256').update(`POST\n${path}\n${timestamp}\n${nonce}\n${body}\n`).sign(createPrivateKey(pem(cfg.WECHAT_PAY_PRIVATE_KEY!)), 'base64');
    const response = await fetch(`https://api.mch.weixin.qq.com${path}`, { method: 'POST', headers: {
      accept: 'application/json', 'content-type': 'application/json',
      authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.WECHAT_PAY_SERIAL_NO}"`,
    }, body, signal: AbortSignal.timeout(15_000) });
    const data = await response.json() as { prepay_id?: string; code?: string; message?: string };
    if (!response.ok) throw new BadRequestException(`微信支付下单失败：${data.message || data.code || response.status}`);
    return data;
  }

  private paymentParams(prepayId: string): PaymentParams {
    const cfg = config();
    const appId = cfg.WECHAT_MINI_APPID!; const timeStamp = Math.floor(Date.now() / 1000).toString(); const nonceStr = randomBytes(16).toString('hex'); const packageValue = `prepay_id=${prepayId}`;
    const paySign = createSign('RSA-SHA256').update(`${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`).sign(createPrivateKey(pem(cfg.WECHAT_PAY_PRIVATE_KEY!)), 'base64');
    return { appId, timeStamp, nonceStr, package: packageValue, signType: 'RSA', paySign };
  }

  private verifyNotify(request: Request, body: string) {
    const cfg = config();
    const timestamp = this.header(request, 'wechatpay-timestamp'); const nonce = this.header(request, 'wechatpay-nonce'); const signature = this.header(request, 'wechatpay-signature');
    if (!timestamp || !nonce || !signature) throw new BadRequestException('缺少微信支付回调签名头');
    const verify = createVerify('RSA-SHA256'); verify.update(`${timestamp}\n${nonce}\n${body}\n`); verify.end();
    if (!verify.verify(createPublicKey(pem(cfg.WECHAT_PAY_PLATFORM_CERT!)), signature, 'base64')) throw new BadRequestException('微信支付回调签名无效');
  }

  private decryptNotify(ciphertext: string, nonce: string, associatedData: string) {
    const key = Buffer.from(config().WECHAT_PAY_API_V3_KEY!, 'utf8'); const encrypted = Buffer.from(ciphertext, 'base64'); const authTag = encrypted.subarray(encrypted.length - 16); const data = encrypted.subarray(0, encrypted.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8')); decipher.setAAD(Buffer.from(associatedData, 'utf8')); decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  private header(request: Request, name: string) { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value; }
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: WechatPayService) {}

  @UseGuards(AuthGuard)
  @Post('qr')
  qr(@Body(new ZodPipe(orderSchema)) body: z.infer<typeof orderSchema>) { return this.payments.createQrOrder(body); }

  @Get('scan/:sceneToken')
  scan(@Param('sceneToken') sceneToken: string) { return this.payments.scan(sceneToken); }

  @UseGuards(AuthGuard)
  @Post('orders/:id/checkout')
  checkout(@Req() request: AuthRequest, @Param('id') id: string) { return this.payments.checkout(request, id); }

  @UseGuards(AuthGuard)
  @Get('orders')
  list(@Req() request: AuthRequest) { return this.payments.list(request); }

  @UseGuards(AuthGuard)
  @Get('orders/:id')
  detail(@Req() request: AuthRequest, @Param('id') id: string) { return this.payments.detail(request, id); }

  @Post('notify')
  notify(@Req() request: Request) { return this.payments.notify(request); }
}
