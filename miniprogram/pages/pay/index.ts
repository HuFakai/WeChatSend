import {post,request} from '../../services/api';
import {errorText,wxSignIn} from '../../services/identity';
type Plan={id:string;name:string;description:string;priceFen:number;membershipDays:number;messageQuota:number};
let stopped=false;
Page({
 data:{scene:'',order:null as any,plans:[] as Plan[],virtualOrder:null as any,loading:false,error:'',paid:false,virtualPaid:false},
 async onLoad(options:{scene?:string;orderId?:string}){
  stopped=false;
  try{
   if(options.orderId){const order=await post<any>('/virtual-payment/orders/'+options.orderId+'/query');this.setData({virtualOrder:order,virtualPaid:order.status==='DELIVERED'});return;}
   const scene=options.scene||'';
   if(scene){this.setData({scene});const order=await request<any>('/payments/scan/'+encodeURIComponent(scene));this.setData({order:{...order,price:(order.amountFen/100).toFixed(2)}});}
   else this.setData({plans:await request<Plan[]>('/virtual-payment/plans')});
  }catch(e){this.setData({error:errorText(e)});}
 },
 onUnload(){stopped=true;},
 orders(){wx.navigateTo({url:'/pages/orders/index'});},
 async pay(){
  if(!this.data.order)return;this.setData({loading:true,error:''});
  try{
   const params=await post<any>('/payments/orders/'+this.data.order.id+'/checkout');
   await new Promise<void>((resolve,reject)=>wx.requestPayment({...params,success:()=>resolve(),fail:reject}));
   for(let i=0;i<8&&!stopped;i++){const o=await request<any>('/payments/orders/'+this.data.order.id);if(o.status==='SUCCESS'){this.setData({paid:true});return;}await new Promise(r=>setTimeout(r,1500));}
   if(!stopped)this.setData({error:'暂未收到服务端确认，请稍后查询。'});
  }catch(e){if(!stopped)this.setData({error:errorText(e)});}finally{if(!stopped)this.setData({loading:false});}
 },
 async refresh(){
  if(!this.data.virtualOrder)return;
  this.setData({loading:true,error:''});
  try{const o=await post<any>('/virtual-payment/orders/'+this.data.virtualOrder.id+'/query');this.setData({virtualOrder:o,virtualPaid:o.status==='DELIVERED'});}
  catch(e){this.setData({error:errorText(e)});}finally{this.setData({loading:false});}
 },
 async waitForVirtual(id:string){
  for(let i=0;i<20&&!stopped;i++){
   const o=await post<any>('/virtual-payment/orders/'+id+'/query');
   if(stopped)return false;
   this.setData({virtualOrder:o,virtualPaid:o.status==='DELIVERED'});
   if(o.status==='DELIVERED')return true;
   if(['CLOSED','REFUNDED','FAILED'].includes(o.status))return false;
   await new Promise(r=>setTimeout(r,3000));
  }return false;
 },
 async buyVirtual(e:WechatMiniprogram.TouchEvent){await this.checkout(String(e.currentTarget.dataset.planId||''));},
 async resume(){await this.checkout();},
 async checkout(planId?:string){
  if(this.data.loading)return;this.setData({loading:true,error:''});let id=this.data.virtualOrder?.id;
  try{
   const invoke=(wx as any).requestVirtualPayment;
   const device=wx.getSystemInfoSync();
   if(typeof invoke!=='function')throw new Error('当前微信不支持虚拟支付，请升级微信。');
   const parts=device.version.split('.').map(Number),version=(parts[0]||0)*10000+(parts[1]||0)*100+(parts[2]||0);
   if(device.platform==='ios'&&version<80068)throw new Error('iOS 请升级到微信 8.0.68 或以上。');
   await wxSignIn();
   const created=planId?await post<any>('/virtual-payment/orders',{planId,quantity:1}):await post<any>('/virtual-payment/orders/'+id+'/checkout');
   id=created.id;this.setData({virtualOrder:created});
   await new Promise<void>((resolve,reject)=>invoke.call(wx,{...created.payData,success:()=>resolve(),fail:reject}));
   if(!await this.waitForVirtual(id)&&!stopped)this.setData({error:'服务端尚未确认发货，请从订单记录查询，不要重复付款。'});
  }catch(e){
   let message=errorText(e);
   if(id){try{const o=await post<any>('/virtual-payment/orders/'+id+'/query');if(!stopped)this.setData({virtualOrder:o,virtualPaid:o.status==='DELIVERED'});if(o.status==='DELIVERED')message='';else message+='；请查询订单确认最终状态。';}catch{message+='；查单暂不可用，请稍后查看订单。';}}
   if(!stopped)this.setData({error:message});
  }finally{if(!stopped)this.setData({loading:false});}
 }
});
