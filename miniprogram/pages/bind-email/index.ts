import {post} from '../../services/api';
import {errorText} from '../../services/identity';
let timer:ReturnType<typeof setTimeout>|undefined;
Page({
 data:{email:'',code:'',challengeId:'',busy:false,error:'',notice:'',cooldown:0},
 input(e:WechatMiniprogram.Input){this.setData({[String(e.currentTarget.dataset.field)]:e.detail.value,...(e.currentTarget.dataset.field==='email'?{challengeId:''}:{})});},
 tick(){if(this.data.cooldown>0){timer=setTimeout(()=>{this.setData({cooldown:this.data.cooldown-1});this.tick();},1000);}},
 onUnload(){if(timer)clearTimeout(timer);},
 async send(){this.setData({busy:true,error:''});try{const r=await post<{challengeId:string}>('/auth/email/bind/code',{email:this.data.email});this.setData({challengeId:r.challengeId,cooldown:60,notice:'验证码已发送，10 分钟有效。'});this.tick();}catch(e){this.setData({error:errorText(e)});}finally{this.setData({busy:false});}},
 async bind(){this.setData({busy:true,error:''});try{const r=await post<{token:string}>('/auth/email/bind',{email:this.data.email,code:this.data.code,challengeId:this.data.challengeId});wx.setStorageSync('wechatsend_token',r.token);wx.showToast({title:'绑定成功'});wx.switchTab({url:'/pages/mine/index'});}catch(e){this.setData({error:errorText(e)});}finally{this.setData({busy:false});}}
});
