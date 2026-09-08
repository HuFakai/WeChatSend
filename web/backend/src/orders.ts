import { Controller, Get, Injectable, OnModuleDestroy, OnModuleInit, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AlipayService } from './alipay';
import { assertAdmin, AuthGuard, AuthRequest } from './auth';
import { PrismaService } from './prisma.service';
import { VirtualPaymentService } from './virtual-payment';
import { ZodPipe } from './zod.pipe';

const listSchema=z.object({channel:z.enum(['ALIPAY','WECHAT_VIRTUAL']).default('ALIPAY'),page:z.coerce.number().int().min(1).max(10000).default(1),status:z.enum(['PENDING','PAID','DELIVERED','CLOSED','FAILED','REFUNDED']).optional(),search:z.string().trim().max(100).optional()});
@Injectable()
export class OrdersService implements OnModuleInit,OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;
  private running=false;
  constructor(private readonly prisma:PrismaService,private readonly alipay:AlipayService,private readonly virtual:VirtualPaymentService){}
  async list(userId:string|undefined,q:z.infer<typeof listSchema>){
    const where={...(userId?{userId}:{}),...(q.status?{status:q.status}:{}),...(q.search?{outTradeNo:{contains:q.search}}:{})};
    const args={where,orderBy:{createdAt:'desc' as const},skip:(q.page-1)*20,take:20,include:{plan:{select:{name:true}},...(!userId?{user:{select:{username:true,email:true}}}:{})}};
    let rows:any[],total:number;
    if(q.channel==='ALIPAY') {
      if(q.status==='DELIVERED') return {items:[],total:0,page:q.page};
      [rows,total]=await Promise.all([this.prisma.alipayOrder.findMany(args as any),this.prisma.alipayOrder.count({where:where as any})]);
    } else [rows,total]=await Promise.all([this.prisma.virtualPaymentOrder.findMany(args as any),this.prisma.virtualPaymentOrder.count({where:where as any})]);
    return {page:q.page,total,items:rows.map(o=>({id:o.id,channel:q.channel,outTradeNo:o.outTradeNo,subject:o.subject||o.plan.name,amountFen:o.amountFen,status:o.status,createdAt:o.createdAt,expiresAt:o.expiresAt,paidAt:o.paidAt,notifyAt:o.notifyAt,deliveredAt:o.deliveredAt,queriedAt:o.queriedAt,tradeNo:o.tradeNo||o.wxOrderId,failureReason:o.failureReason,...(!userId?{user:o.user}:{})}))};
  }
  async refresh(r:AuthRequest,channel:string,id:string,admin=false){
    const model=channel==='ALIPAY'?this.prisma.alipayOrder:this.prisma.virtualPaymentOrder;
    if(admin){assertAdmin(r);const row=await (model as any).findUnique({where:{id}});if(row) r={...r,user:{...r.user,id:row.userId}} as AuthRequest;}
    return channel==='ALIPAY'?this.alipay.query(r,id):this.virtual.query(r,id);
  }
  onModuleInit(){this.timer=setInterval(()=>void this.reconcile(),30000);this.timer.unref();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async reconcile(){
    if(this.running)return;this.running=true;
    try {
      const date=new Date(Date.now()-7*86400000);
      const rows=await this.prisma.alipayOrder.findMany({where:{status:{in:['PENDING','PAID']},createdAt:{gt:date}},orderBy:{queriedAt:{sort:'asc',nulls:'first'}},take:10});
      for(const row of rows) await this.alipay.reconcile(row).catch(()=>undefined);
      const virtual=await this.prisma.virtualPaymentOrder.findMany({where:{status:{in:['PENDING','PAID','DELIVERED']},createdAt:{gt:date}},orderBy:{queriedAt:{sort:'asc',nulls:'first'}},take:5});
      for(const row of virtual) await this.virtual.query({user:{id:row.userId}} as AuthRequest,row.id).catch(()=>undefined);
      await this.prisma.authChallenge.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-86400000)}}});
    } catch { /* A database/provider outage must not stop later reconciliation. */ }
    finally{this.running=false;}
  }
}
@UseGuards(AuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders:OrdersService){}
  @Get() list(@Req() r:AuthRequest,@Query(new ZodPipe(listSchema)) q:z.infer<typeof listSchema>){return this.orders.list(r.user.id,q);}
  @Post(':channel/:id/query') refresh(@Req() r:AuthRequest,@Param('channel',new ZodPipe(z.enum(['ALIPAY','WECHAT_VIRTUAL']))) c:string,@Param('id',ParseUUIDPipe) id:string){return this.orders.refresh(r,c,id);}
}
@UseGuards(AuthGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders:OrdersService){}
  @Get() list(@Req() r:AuthRequest,@Query(new ZodPipe(listSchema)) q:z.infer<typeof listSchema>){assertAdmin(r);return this.orders.list(undefined,q);}
  @Post(':channel/:id/query') refresh(@Req() r:AuthRequest,@Param('channel',new ZodPipe(z.enum(['ALIPAY','WECHAT_VIRTUAL']))) c:string,@Param('id',ParseUUIDPipe) id:string){return this.orders.refresh(r,c,id,true);}
}
