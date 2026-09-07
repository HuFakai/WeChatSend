import { publicPost } from './services/api';

let launchScene = '';

function sceneFrom(options: WechatMiniprogram.App.LaunchShowOption) {
  const raw = options.query?.scene;
  return raw ? decodeURIComponent(raw) : '';
}

function rememberScene(scene: string) {
  if (!scene) return;
  wx.setStorageSync('wechatsend_pending_scene', scene);
}

App({
  onLaunch(options: WechatMiniprogram.App.LaunchShowOption) {
    const scene = sceneFrom(options);
    launchScene = scene;
    rememberScene(scene);
    const token = wx.getStorageSync('wechatsend_token');
    if (token) {
      if (scene) wx.redirectTo({ url: `/pages/pay/index?scene=${encodeURIComponent(scene)}` });
      else wx.switchTab({ url: '/pages/index/index' });
      return;
    }
    wx.login({
      success: async ({ code }) => {
        try {
          const result = await publicPost<{ token: string; user?: { needsProfile?: boolean } }>('/auth/miniprogram/silent', { code });
          if (result.user?.needsProfile) {
            wx.reLaunch({ url: '/pages/login/index' });
            return;
          }
          wx.setStorageSync('wechatsend_token', result.token);
          const pending = wx.getStorageSync('wechatsend_pending_scene');
          if (pending) wx.redirectTo({ url: `/pages/pay/index?scene=${encodeURIComponent(pending)}` });
          else wx.switchTab({ url: '/pages/index/index' });
        } catch { wx.reLaunch({ url: '/pages/login/index' }); }
      },
      fail: () => wx.reLaunch({ url: '/pages/login/index' }),
    });
  },
  onShow(options: WechatMiniprogram.App.LaunchShowOption) {
    const scene = sceneFrom(options);
    if (!scene) return;
    if (scene === launchScene) {
      launchScene = '';
      return;
    }
    rememberScene(scene);
    const token = wx.getStorageSync('wechatsend_token');
    if (token) wx.redirectTo({ url: `/pages/pay/index?scene=${encodeURIComponent(scene)}` });
    else wx.reLaunch({ url: '/pages/login/index' });
  },
});
