import { post, request } from '../../services/api';
Page({
  data: { user: {} as any },
  onShow() { void request('/auth/me').then((user) => this.setData({ user })); },
  accounts() { wx.navigateTo({ url: '/pages/accounts/index' }); },
  friends() { wx.navigateTo({ url: '/pages/friends/index' }); },
  async logout() { await post('/auth/logout').catch(() => undefined); wx.removeStorageSync('wechatsend_token'); wx.reLaunch({ url: '/pages/login/index' }); },
});
