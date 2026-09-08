import {post,request} from '../../services/api';
import {errorText} from '../../services/identity';
const statuses:Record<string,string>={PENDING:'待支付 / 待核实',PAID:'已支付',DELIVERED:'已支付 · 权益已发放',FAILED:'下单失败',CLOSED:'已关闭',REFUNDED:'已退款'};
const date=(v?:string)=>v?new Date(v).toLocaleString():'—';
Page({
 data:{channel:'WECHAT_VIRTUAL',page:1,total:0,items:[] as any[],busy:false,error:''},
 onShow(){void this.load();},
 async load(){this.setData({busy:true,error:''});try{const r=await request<{items:any[];total:number}>(`/orders?channel=${this.data.channel}&page=${this.data.page}`);this.setData({total:r.total,items:r.items.map(o=>({...o,price:(o.amountFen/100).toFixed(2),statusText:statuses[o.status]||o.status,createdText:date(o.createdAt),paidText:date(o.paidAt),feedbackText:date(o.notifyAt||o.deliveredAt),queryText:date(o.queriedAt)}))});}catch(e){this.setData({error:errorText(e)});}finally{this.setData({busy:false});}},
 channel(e:WechatMiniprogram.TouchEvent){this.setData({channel:String(e.currentTarget.dataset.channel),page:1});void this.load();},
 async query(e:WechatMiniprogram.TouchEvent){this.setData({busy:true,error:''});try{await post(`/orders/${this.data.channel}/${e.currentTarget.dataset.id}/query`);await this.load();}catch(e){this.setData({error:errorText(e)});}finally{this.setData({busy:false});}},
 resume(e:WechatMiniprogram.TouchEvent){wx.navigateTo({url:`/pages/pay/index?orderId=${e.currentTarget.dataset.id}`});},
 prev(){if(this.data.page>1){this.setData({page:this.data.page-1});void this.load();}},next(){if(this.data.page*20<this.data.total){this.setData({page:this.data.page+1});void this.load();}}
});
