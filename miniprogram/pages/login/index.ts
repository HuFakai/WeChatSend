import { publicPost } from '../../services/api';

Page({
  data: { loading: false, error: '' },
  async login() {
    this.setData({ loading: true, error: '' });
    try {
      const profile = await new Promise<WechatMiniprogram.GetUserProfileSuccessCallbackResult>((resolve, reject) => wx.getUserProfile({ desc: '用于显示昵称头像并绑定 WeChatSend 身份', success: resolve, fail: reject }));
      const login = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>((resolve, reject) => wx.login({ success: resolve, fail: reject }));
      const result = await publicPost<{ token: string }>('/auth/miniprogram/login', { code: login.code, nickname: profile.userInfo.nickName, avatarUrl: profile.userInfo.avatarUrl });
      wx.setStorageSync('wechatsend_token', result.token);
      const scene = wx.getStorageSync('wechatsend_pending_scene');
      if (scene) { wx.removeStorageSync('wechatsend_pending_scene'); wx.redirectTo({ url: `/pages/pay/index?scene=${encodeURIComponent(scene)}` }); }
      else wx.switchTab({ url: '/pages/index/index' });
    } catch (error) { this.setData({ error: (error as Error).message }); }
    finally { this.setData({ loading: false }); }
  },
});
