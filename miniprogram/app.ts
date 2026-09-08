import {publicPost} from './services/api';
import {continueAfterLogin} from './services/identity';
let launchScene='';
function sceneFrom(o:WechatMiniprogram.App.LaunchShowOption){try{return decodeURIComponent(o.query?.scene||'');}catch{return '';}}
App({onLaunch(o:WechatMiniprogram.App.LaunchShowOption){const scene=sceneFrom(o);launchScene=scene;if(scene)wx.setStorageSync('wechatsend_pending_scene',scene);
  if(o.path==='pages/scan/index')return;
  if(wx.getStorageSync('wechatsend_token')){if(scene||!o.path||o.path==='pages/login/index')continueAfterLogin();return;}
  wx.login({success:async({code})=>{try{const r=await publicPost<{token?:string}>('/auth/miniprogram/silent',{code});if(!r.token){wx.reLaunch({url:'/pages/login/index'});return;}wx.setStorageSync('wechatsend_token',r.token);continueAfterLogin();}catch{wx.reLaunch({url:'/pages/login/index'});}},fail:()=>wx.reLaunch({url:'/pages/login/index'})});
},onShow(o:WechatMiniprogram.App.LaunchShowOption){const scene=sceneFrom(o);if(!scene)return;if(scene===launchScene){launchScene='';return;}wx.setStorageSync('wechatsend_pending_scene',scene);if(o.path==='pages/scan/index')return;if(wx.getStorageSync('wechatsend_token'))continueAfterLogin();else wx.reLaunch({url:'/pages/login/index'});}});
