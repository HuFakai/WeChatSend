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
import { AlipayOrderStatus, MembershipGrantSource, Prisma } from '@prisma/client';
import { AlipaySdk } from 'alipay-sdk';
import QRCode from 'qrcode';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { config } from './config';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const orderSchema = z.object({ planId: z.string().uuid() });

type AlipayResponse = Record<string, any>;

function publicKey(value: string) {
  return value.replace(/\\n/g, '\n').trim();
}

function centsToYuan(amountFen: number) {
  return (amountFen / 100).toFixed(2);
}

function responseBody(result: AlipayResponse, method: string) {
  const camel = method.replace(/\.([a-z])/g, (_, char: string) => char.toUpperCase());
  const snake = method;
  return result[`${camel}Response`] ?? result[`${snake}_response`] ?? result;
}

function isSuccessCode(value: unknown) {
  return String(value || '') === '10000';
}

function field(record: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const value = record[name];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return undefined;
}

function amountFen(value: unknown) {
  const text = String(value ?? '').trim();
  const match = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return undefined;
  const whole = Number(text.split('.')[0]);
  const fraction = Number((match[1] || '').padEnd(2, '0'));
  return whole * 100 + fraction;
}

@Injectable()
export class AlipayService {
  constructor(private readonly prisma: PrismaService) {}

  async plans() {
    return this.prisma.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceFen: 'asc' }],
      select: { id: true, code: true, name: true, description: true, priceFen: true, membershipDays: true, messageQuota: true },
    });
  }

  async createOrder(request: AuthRequest, body: z.infer<typeof orderSchema>) {
    const sdk = this.sdk();
    const plan = await this.prisma.membershipPlan.findFirst({ where: { id: body.planId, isActive: true } });
    if (!plan) throw new NotFoundException('会员套餐不存在或已下架');
    const cfg = config();
    const orderId = randomUUID();
    const outTradeNo = `WA${Date.now().toString(36)}${randomBytes(6).toString('hex')}`.slice(0, 32);
    const expiresAt = new Date(Date.now() + cfg.ALIPAY_ORDER_EXPIRE_MINUTES * 60_000);
    const subject = `WeChatSend-${plan.name}`.slice(0, 256);
    const order = await this.prisma.alipayOrder.create({ data: {
      id: orderId, userId: request.user.id, planId: plan.id, outTradeNo, subject, amountFen: plan.priceFen, expiresAt,
    } });

    try {
      const result = await sdk.exec('alipay.trade.precreate', { bizContent: {
        outTradeNo: order.outTradeNo,
        totalAmount: centsToYuan(order.amountFen),
        subject: order.subject,
        productCode: 'FACE_TO_FACE_PAYMENT',
        ...(cfg.ALIPAY_SELLER_ID ? { sellerId: cfg.ALIPAY_SELLER_ID } : {}),
        ...(cfg.ALIPAY_NOTIFY_URL ? { notifyUrl: cfg.ALIPAY_NOTIFY_URL } : {}),
        timeoutExpress: `${cfg.ALIPAY_ORDER_EXPIRE_MINUTES}m`,
      } }, { validateSign: true });
      const payload = responseBody(result as AlipayResponse, 'alipay.trade.precreate');
      if (!isSuccessCode(payload.code)) throw new Error(payload.subMsg || payload.sub_msg || payload.msg || '支付宝预创建订单失败');
      const qrCode = payload.qrCode || payload.qr_code;
      if (typeof qrCode !== 'string' || !qrCode) throw new Error('支付宝未返回二维码内容');
      await this.prisma.alipayOrder.update({ where: { id: order.id }, data: { qrCode } });
      return { id: order.id, outTradeNo: order.outTradeNo, subject: order.subject, amountFen: order.amountFen, expiresAt: order.expiresAt, status: order.status, qrCode, qrDataUrl: await QRCode.toDataURL(qrCode, { errorCorrectionLevel: 'M', margin: 1, width: 320 }) };
    } catch (error) {
      await this.prisma.alipayOrder.update({ where: { id: order.id }, data: { status: AlipayOrderStatus.FAILED, failureReason: (error as Error).message.slice(0, 500) } }).catch(() => undefined);
      throw new BadRequestException(`支付宝下单失败：${(error as Error).message}`);
    }
  }

  async detail(request: AuthRequest, id: string) {
    const order = await this.prisma.alipayOrder.findFirst({ where: { id, userId: request.user.id }, include: { plan: { select: { name: true, description: true, membershipDays: true, messageQuota: true } } } });
    if (!order) throw new NotFoundException('支付宝订单不存在');
    return this.publicOrder(order);
  }

  async query(request: AuthRequest, id: string) {
    const order = await this.prisma.alipayOrder.findFirst({ where: { id, userId: request.user.id }, include: { plan: true } });
    if (!order) throw new NotFoundException('支付宝订单不存在');
    if (order.status === AlipayOrderStatus.PAID) return this.publicOrder(order);
    if (order.status === AlipayOrderStatus.PENDING && order.expiresAt <= new Date()) {
      await this.cancel(order.outTradeNo);
      return this.detail(request, id);
    }
    const result = await this.sdk().exec('alipay.trade.query', { bizContent: { outTradeNo: order.outTradeNo } }, { validateSign: true });
    const payload = responseBody(result as AlipayResponse, 'alipay.trade.query');
    const tradeStatus = String(payload.tradeStatus || payload.trade_status || '');
    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      this.assertPaymentDetails(order, payload, false);
      await this.markPaid(order.id, { tradeNo: payload.tradeNo || payload.trade_no, raw: result, fromNotification: false });
    } else if (tradeStatus === 'TRADE_CLOSED') {
      await this.prisma.alipayOrder.update({ where: { id: order.id }, data: { status: AlipayOrderStatus.CLOSED, failureReason: '支付宝订单已关闭', notifyRaw: result as Prisma.InputJsonValue } });
    }
    return this.detail(request, id);
  }

  async notify(request: Request) {
    const body = request.body as Record<string, string | undefined>;
    let verified = false;
    try { verified = this.sdk().checkNotifySignV2(body); } catch { verified = false; }
    if (!verified) return 'fail';
    const outTradeNo = body.out_trade_no;
    if (!outTradeNo) return 'fail';
    const order = await this.prisma.alipayOrder.findUnique({ where: { outTradeNo } });
    if (!order) return 'fail';
    const tradeStatus = body.trade_status;
    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      this.assertPaymentDetails(order, body, true);
      await this.markPaid(order.id, { tradeNo: body.trade_no, raw: body, fromNotification: true });
    } else if (tradeStatus === 'TRADE_CLOSED') {
      await this.prisma.alipayOrder.updateMany({ where: { id: order.id, status: AlipayOrderStatus.PENDING }, data: { status: AlipayOrderStatus.CLOSED, notifyAt: new Date(), notifyRaw: body as Prisma.InputJsonValue } });
    }
    return 'success';
  }

  private sdk() {
    const cfg = config();
    if (!cfg.ALIPAY_APP_ID || !cfg.ALIPAY_PRIVATE_KEY || !cfg.ALIPAY_PUBLIC_KEY || !cfg.ALIPAY_NOTIFY_URL) throw new BadRequestException('未完整配置支付宝订单码支付：ALIPAY_APP_ID、ALIPAY_PRIVATE_KEY、ALIPAY_PUBLIC_KEY、ALIPAY_NOTIFY_URL');
    return new AlipaySdk({
      appId: cfg.ALIPAY_APP_ID,
      privateKey: publicKey(cfg.ALIPAY_PRIVATE_KEY),
      alipayPublicKey: publicKey(cfg.ALIPAY_PUBLIC_KEY),
      gateway: cfg.ALIPAY_GATEWAY,
      keyType: cfg.ALIPAY_KEY_TYPE,
      timeout: 15_000,
    });
  }

  private async cancel(outTradeNo: string) {
    try {
      const result = await this.sdk().exec('alipay.trade.cancel', { bizContent: { outTradeNo } }, { validateSign: true });
      const payload = responseBody(result as AlipayResponse, 'alipay.trade.cancel');
      if (isSuccessCode(payload.code) || payload.action === 'close') {
        await this.prisma.alipayOrder.updateMany({ where: { outTradeNo, status: AlipayOrderStatus.PENDING }, data: { status: AlipayOrderStatus.CLOSED, failureReason: '订单超时关闭' } });
      }
    } catch {
      await this.prisma.alipayOrder.updateMany({ where: { outTradeNo, status: AlipayOrderStatus.PENDING }, data: { status: AlipayOrderStatus.CLOSED, failureReason: '订单超时，已结束本地支付会话' } });
    }
  }

  private assertPaymentDetails(order: { outTradeNo: string; amountFen: number }, details: Record<string, unknown>, strict: boolean) {
    const cfg = config();
    const outTradeNo = field(details, 'outTradeNo', 'out_trade_no');
    const appId = field(details, 'appId', 'app_id');
    const sellerId = field(details, 'sellerId', 'seller_id');
    const totalAmount = field(details, 'totalAmount', 'total_amount');
    if (outTradeNo && outTradeNo !== order.outTradeNo) throw new BadRequestException('支付宝订单号不匹配');
    if (strict && appId !== cfg.ALIPAY_APP_ID) throw new BadRequestException('支付宝应用不匹配');
    if (appId && appId !== cfg.ALIPAY_APP_ID) throw new BadRequestException('支付宝应用不匹配');
    if (cfg.ALIPAY_SELLER_ID && (strict ? sellerId !== cfg.ALIPAY_SELLER_ID : Boolean(sellerId && sellerId !== cfg.ALIPAY_SELLER_ID))) {
      throw new BadRequestException('支付宝收款账号不匹配');
    }
    if (amountFen(totalAmount) !== order.amountFen) throw new BadRequestException('支付宝订单金额不匹配');
  }

  private async markPaid(id: string, detail: { tradeNo?: string; raw: unknown; fromNotification: boolean }) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.alipayOrder.findUnique({ where: { id }, include: { plan: true } });
      if (!order || order.status === AlipayOrderStatus.PAID) return;
      if (order.status === AlipayOrderStatus.CLOSED || order.status === AlipayOrderStatus.REFUNDED || order.status === AlipayOrderStatus.FAILED) return;
      const now = new Date();
      await tx.membershipGrant.upsert({
        where: { source_sourceOrderId: { source: MembershipGrantSource.ALIPAY, sourceOrderId: order.id } },
        create: {
          userId: order.userId, planId: order.planId, source: MembershipGrantSource.ALIPAY, sourceOrderId: order.id,
          quantity: 1, quotaTotal: order.plan.messageQuota, startsAt: now,
          expiresAt: new Date(now.getTime() + order.plan.membershipDays * 86_400_000),
        },
        update: {},
      });
      await tx.alipayOrder.update({ where: { id }, data: {
        status: AlipayOrderStatus.PAID,
        tradeNo: detail.tradeNo || order.tradeNo,
        paidAt: order.paidAt || now,
        ...(detail.fromNotification ? { notifyAt: now } : {}),
        notifyRaw: detail.raw as Prisma.InputJsonValue,
      } });
    });
  }

  private publicOrder(order: { id: string; outTradeNo: string; subject: string; amountFen: number; status: AlipayOrderStatus; qrCode: string | null; expiresAt: Date; paidAt: Date | null; createdAt: Date; updatedAt: Date; plan?: { name: string; description: string; membershipDays?: number; messageQuota?: number } }) {
    return { id: order.id, outTradeNo: order.outTradeNo, subject: order.subject, amountFen: order.amountFen, status: order.status, qrCode: order.qrCode, expiresAt: order.expiresAt, paidAt: order.paidAt, createdAt: order.createdAt, updatedAt: order.updatedAt, plan: order.plan };
  }
}

@Controller('alipay')
export class AlipayController {
  constructor(private readonly payment: AlipayService) {}

  @Get('plans') plans() { return this.payment.plans(); }

  @UseGuards(AuthGuard)
  @Post('orders') order(@Req() request: AuthRequest, @Body(new ZodPipe(orderSchema)) body: z.infer<typeof orderSchema>) { return this.payment.createOrder(request, body); }

  @UseGuards(AuthGuard)
  @Get('orders/:id') detail(@Req() request: AuthRequest, @Param('id') id: string) { return this.payment.detail(request, id); }

  @UseGuards(AuthGuard)
  @Post('orders/:id/query') query(@Req() request: AuthRequest, @Param('id') id: string) { return this.payment.query(request, id); }

  @Post('notify') notify(@Req() request: Request) { return this.payment.notify(request); }
}
