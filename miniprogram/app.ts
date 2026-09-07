import { publicPost } from './services/api';

App({
  onLaunch(options: WechatMiniprogram.App.LaunchShowOption) {
    const scene = options.query?.scene;
    if (scene) wx.setStorageSync('wechatsend_pending_scene', decodeURIComponent(scene));
    const token = wx.getStorageSync('wechatsend_token');
    if (token) {
      if (scene) wx.redirectTo({ url: `/pages/pay/index?scene=${encodeURIComponent(decodeURIComponent(scene))}` });
      return;
    }
    wx.login({
      success: async ({ code }) => {
        try {
          const result = await publicPost<{ token: string }>('/auth/miniprogram/silent', { code });
          wx.setStorageSync('wechatsend_token', result.token);
          const pending = wx.getStorageSync('wechatsend_pending_scene');
          if (pending) wx.redirectTo({ url: `/pages/pay/index?scene=${encodeURIComponent(pending)}` });
          else wx.switchTab({ url: '/pages/index/index' });
        } catch { wx.reLaunch({ url: '/pages/login/index' }); }
      },
      fail: () => wx.reLaunch({ url: '/pages/login/index' }),
    });
  },
});
