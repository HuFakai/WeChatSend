import { publicPost } from './api';
export function errorText(error: unknown){const e=error as {message?:string;errMsg?:string};return e?.message||e?.errMsg||'操作未完成，请稍后重试';}
export async function wxSignIn(){
  const login=await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>((resolve,reject)=>wx.login({success:resolve,fail:reject}));
  const result=await publicPost<{token:string}>('/auth/miniprogram/login',{code:login.code});
  if(!result.token)throw new Error('未获得登录凭据');
  wx.setStorageSync('wechatsend_token',result.token);return result;
}
export function continueAfterLogin(){
  const scene=String(wx.getStorageSync('wechatsend_pending_scene')||'');
  wx.removeStorageSync('wechatsend_pending_scene');
  if(scene)wx.redirectTo({url:`/pages/${scene.startsWith('lg')?'scan':'pay'}/index?scene=${encodeURIComponent(scene)}`});
  else wx.switchTab({url:'/pages/index/index'});
}
