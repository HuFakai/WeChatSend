import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AlipayOrder, Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';
import { AlipayConfigService, AlipaySettings } from './alipay-config';
import { encryptSecret } from './secrets';

const orderSchema = z.object({ planId: z.string().uuid() });
export const ALIPAY_ORDER_PRODUCT_CODE = 'QR_CODE_OFFLINE';
type Payload = Record<string, any>;
export function yuanToFen(value: unknown) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value ?? ''));
  if (!match) return undefined;
  const result = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2,'0'));
  return Number.isSafeInteger(result) ? result : undefined;
}
export function assertAlipayPayment(order: { outTradeNo: string; amountFen: number }, payload: Payload, cfg: AlipaySettings, notify: boolean) {
  if ((payload.outTradeNo || payload.out_trade_no) !== order.outTradeNo) throw new BadRequestException('支付订单号不匹配');
  if (yuanToFen(payload.totalAmount ?? payload.total_amount) !== order.amountFen) throw new BadRequestException('支付金额不匹配');
  const appId = payload.appId || payload.app_id, sellerId = payload.sellerId || payload.seller_id;
  if ((notify || appId) && appId !== cfg.appId) throw new BadRequestException('支付应用不匹配');
  if (cfg.sellerId && (notify || sellerId) && sellerId !== cfg.sellerId) throw new BadRequestException('收款账号不匹配');
  if (!(payload.tradeNo || payload.trade_no)) throw new BadRequestException('缺少支付宝交易号');
}
@Injectable()
export class AlipayService {
  constructor(private readonly prisma: PrismaService, private readonly settings: AlipayConfigService) {}
  async plans() {
    return this.prisma.membershipPlan.findMany({where:{isActive:true},orderBy:[{sortOrder:'asc'},{priceFen:'asc'}],select:{id:true,code:true,name:true,description:true,priceFen:true,membershipDays:true,messageQuota:true}});
  }
  async createOrder(request: AuthRequest, body:z.infer<typeof orderSchema>) {
    const cfg=await this.settings.settings();
    if(!cfg.enabled) throw new BadRequestException('支付宝支付尚未启用');
    const sdk=this.settings.sdk(cfg);
    const plan=await this.prisma.membershipPlan.findFirst({where:{id:body.planId,isActive:true}});
    if(!plan) throw new NotFoundException('套餐不存在或已下架');
    const reserved=await this.prisma.$transaction(async(tx)=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'alipay:'+request.user.id+':'+plan.id})) IS NULL AS acquired`;
      const existing=await tx.alipayOrder.findFirst({where:{userId:request.user.id,planId:plan.id,status:'PENDING',expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'}});
      if(existing) return {order:existing,created:false};
      const order=await tx.alipayOrder.create({data:{userId:request.user.id,planId:plan.id,outTradeNo:'WA'+Date.now().toString(36)+randomBytes(8).toString('hex'),subject:('WeChatSend-'+plan.name).slice(0,256),amountFen:plan.priceFen,membershipDays:plan.membershipDays,messageQuota:plan.messageQuota,encryptedConfig:encryptSecret(JSON.stringify(cfg)),expiresAt:new Date(Date.now()+cfg.expireMinutes*60000)}});
      return {order,created:true};
    });
    const {order}=reserved;
    if(!reserved.created) return this.publicOrder(order);
    try {
      const result=await sdk.exec('alipay.trade.precreate',{notifyUrl:cfg.notifyUrl,bizContent:{outTradeNo:order.outTradeNo,totalAmount:(order.amountFen/100).toFixed(2),subject:order.subject,productCode:ALIPAY_ORDER_PRODUCT_CODE,...(cfg.sellerId?{sellerId:cfg.sellerId}:{}),timeoutExpress:cfg.expireMinutes+'m'}},{validateSign:true});
      if(String(result.code)!=='10000'||!result.qrCode) {
        const definitive=String(result.code)==='40004';
        await this.prisma.alipayOrder.updateMany({where:{id:order.id,status:'PENDING'},data:{...(definitive?{status:'FAILED' as const}:{}),failureReason:definitive?'支付宝拒绝下单，请联系管理员检查签约与配置':'下单结果待核实，请从订单记录查询，不要重复付款'}});
      } else await this.prisma.alipayOrder.update({where:{id:order.id},data:{qrCode:String(result.qrCode),failureReason:null}});
    } catch {
      await this.prisma.alipayOrder.updateMany({where:{id:order.id,status:'PENDING'},data:{failureReason:'支付平台暂不可用，下单结果待核实，请稍后刷新订单'}});
    }
    return this.detail(request,order.id);
  }
  async detail(request:AuthRequest,id:string){
    const order=await this.prisma.alipayOrder.findFirst({where:{id,userId:request.user.id}});
    if(!order) throw new NotFoundException('订单不存在');
    return this.publicOrder(order);
  }
  async query(request:AuthRequest,id:string){
    const order=await this.prisma.alipayOrder.findFirst({where:{id,userId:request.user.id}});
    if(!order) throw new NotFoundException('订单不存在');
    await this.reconcile(order);
    return this.detail(request,id);
  }
  async reconcile(order:AlipayOrder){
    if(['CLOSED','REFUNDED','FAILED'].includes(order.status)) return;
    const claimed=await this.prisma.alipayOrder.updateMany({where:{id:order.id,OR:[{queriedAt:null},{queriedAt:{lt:new Date(Date.now()-5000)}}]},data:{queriedAt:new Date()}});
    if(!claimed.count) return;
    const cfg=await this.settings.forOrder(order),sdk=this.settings.sdk(cfg);
    try {
      const result=await sdk.exec('alipay.trade.query',{bizContent:{outTradeNo:order.outTradeNo}},{validateSign:true});
      if(String(result.code)!=='10000'){
        if(result.subCode==='ACQ.TRADE_NOT_EXIST'&&order.expiresAt<new Date()&&!order.qrCode) await this.prisma.alipayOrder.updateMany({where:{id:order.id,status:'PENDING'},data:{status:'CLOSED',failureReason:'支付宝未创建该订单，已过期'}});
        return;
      }
      if(['TRADE_SUCCESS','TRADE_FINISHED'].includes(result.tradeStatus)){
        assertAlipayPayment(order,result,cfg,false);
        await this.markPaid(order.id,result,false);
      } else if(result.tradeStatus==='TRADE_CLOSED') await this.markClosed(order.id,result);
      else if(result.tradeStatus==='WAIT_BUYER_PAY'&&order.expiresAt<=new Date()){
        const closed=await sdk.exec('alipay.trade.close',{bizContent:{outTradeNo:order.outTradeNo}},{validateSign:true});
        if(String(closed.code)==='10000') await this.prisma.alipayOrder.updateMany({where:{id:order.id,status:'PENDING'},data:{status:'CLOSED',failureReason:'未支付订单已超时关闭'}});
      }
    } catch { /* Keep verified state on unknown outcome. Reconciliation retries later. */ }
  }
  async notify(request:Request){
    const body=request.body as Payload;
    if(!body||typeof body.out_trade_no!=='string') return 'fail';
    const order=await this.prisma.alipayOrder.findUnique({where:{outTradeNo:body.out_trade_no}});
    if(!order) return 'fail';
    try {
      const cfg=await this.settings.forOrder(order);
      if(!this.settings.sdk(cfg).checkNotifySignV2(body)||body.app_id!==cfg.appId||(cfg.sellerId&&body.seller_id!==cfg.sellerId)) return 'fail';
      if(['TRADE_SUCCESS','TRADE_FINISHED'].includes(body.trade_status)){assertAlipayPayment(order,body,cfg,true);await this.markPaid(order.id,body,true);}
      else if(body.trade_status==='TRADE_CLOSED') await this.markClosed(order.id,body);
      else return 'success';
      await this.prisma.alipayOrder.update({where:{id:order.id},data:{notifyAt:new Date()}});
      return 'success';
    } catch{return 'fail';}
  }
  private async markClosed(id:string,raw:unknown){
    await this.prisma.$transaction(async(tx)=>{
      await tx.$queryRaw`SELECT id FROM alipay_orders WHERE id=${id}::uuid FOR UPDATE`;
      const row=await tx.alipayOrder.findUniqueOrThrow({where:{id}});
      const refunded=row.status==='PAID'||row.status==='REFUNDED';
      await tx.alipayOrder.update({where:{id},data:{status:refunded?'REFUNDED':'CLOSED',notifyRaw:raw as Prisma.InputJsonValue}});
      if(refunded) await tx.membershipGrant.updateMany({where:{source:'ALIPAY',sourceOrderId:id,expiresAt:{gt:new Date()}},data:{expiresAt:new Date()}});
    });
  }
  private async markPaid(id:string,raw:Payload,notify:boolean){
    await this.prisma.$transaction(async(tx)=>{
      await tx.$queryRaw`SELECT id FROM alipay_orders WHERE id=${id}::uuid FOR UPDATE`;
      const order=await tx.alipayOrder.findUniqueOrThrow({where:{id},include:{plan:true}});
      if(order.status==='REFUNDED') return;
      const now=new Date();
      await tx.membershipGrant.upsert({where:{source_sourceOrderId:{source:'ALIPAY',sourceOrderId:id}},create:{userId:order.userId,planId:order.planId,source:'ALIPAY',sourceOrderId:id,quotaTotal:order.messageQuota??order.plan.messageQuota,startsAt:now,expiresAt:new Date(now.getTime()+(order.membershipDays??order.plan.membershipDays)*86400000)},update:{}});
      await tx.alipayOrder.update({where:{id},data:{status:'PAID',tradeNo:raw.tradeNo||raw.trade_no,paidAt:order.paidAt||now,...(notify?{notifyAt:now}:{}),notifyRaw:raw as Prisma.InputJsonValue,failureReason:null}});
    });
  }
  async publicOrder(o:AlipayOrder){
    return {id:o.id,channel:'ALIPAY',outTradeNo:o.outTradeNo,tradeNo:o.tradeNo,subject:o.subject,amountFen:o.amountFen,status:o.status,expiresAt:o.expiresAt,createdAt:o.createdAt,paidAt:o.paidAt,notifyAt:o.notifyAt,queriedAt:o.queriedAt,failureReason:o.failureReason,membershipDays:o.membershipDays,messageQuota:o.messageQuota,...(o.status==='PENDING'&&o.expiresAt>new Date()&&o.qrCode?{qrDataUrl:await QRCode.toDataURL(o.qrCode,{width:320,margin:1})}:{})};
  }
}
@Controller('alipay')
export class AlipayController {
  constructor(private readonly payment:AlipayService){}
  @Get('plans') plans(){return this.payment.plans();}
  @UseGuards(AuthGuard) @Post('orders') order(@Req() r:AuthRequest,@Body(new ZodPipe(orderSchema)) b:z.infer<typeof orderSchema>){return this.payment.createOrder(r,b);}
  @UseGuards(AuthGuard) @Get('orders/:id') detail(@Req() r:AuthRequest,@Param('id',ParseUUIDPipe) id:string){return this.payment.detail(r,id);}
  @UseGuards(AuthGuard) @Post('orders/:id/query') query(@Req() r:AuthRequest,@Param('id',ParseUUIDPipe) id:string){return this.payment.query(r,id);}
  @HttpCode(200) @Post('notify') notify(@Req() r:Request){return this.payment.notify(r);}
}
