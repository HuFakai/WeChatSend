import { request,post } from '../../services/api';
import { errorText,wxSignIn } from '../../services/identity';
Page({
 data:{scene:'',action:'',account:'',devTicket:'',error:'',busy:false,done:false},
 async onLoad(options:{scene?:string}){
  const scene=decodeURIComponent(options.scene||String(wx.getStorageSync('wechatsend_pending_scene')||''));
  if(!/^lg[a-f0-9]{24}$/.test(scene)){this.setData({error:'无效二维码，请在网页重新生成'});return;}
  this.setData({scene,busy:true});wx.removeStorageSync('wechatsend_pending_scene');
  try{if(!wx.getStorageSync('wechatsend_token'))await wxSignIn();const info=await request<{action:string;account?:string;devTicket?:string}>(`/auth/scan/${scene}`);this.setData({action:info.action,account:info.account||'',devTicket:info.devTicket||''});}catch(e){this.setData({error:errorText(e)});}finally{this.setData({busy:false});}
 },
 async confirm(){this.setData({busy:true,error:''});try{const r=await post<{token:string}>(`/auth/scan/${this.data.scene}/approve`);wx.setStorageSync('wechatsend_token',r.token);this.setData({done:true});}catch(e){this.setData({error:errorText(e)});}finally{this.setData({busy:false});}},
 cancel(){wx.switchTab({url:'/pages/mine/index'});}
});
