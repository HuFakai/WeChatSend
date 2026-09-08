import { errorText } from '../../services/identity';
import { post, request } from '../../services/api';
Page({
  data: { user: {} as any, error:'' },
  onShow() { void request('/auth/me').then((user) => this.setData({ user, error:'' })).catch(e=>this.setData({error:errorText(e)})); },
  bindEmail(){wx.navigateTo({url:'/pages/bind-email/index'});},
  orders(){wx.navigateTo({url:'/pages/orders/index'});},
  accounts() { wx.navigateTo({ url: '/pages/accounts/index' }); },
  friends() { wx.navigateTo({ url: '/pages/friends/index' }); },
  templates() { wx.navigateTo({ url: '/pages/templates/index' }); },
  variables() { wx.navigateTo({ url: '/pages/variables/index' }); },
  membership() { wx.navigateTo({ url: '/pages/pay/index' }); },
  async logout() { await post('/auth/logout').catch(() => undefined); wx.removeStorageSync('wechatsend_token'); wx.reLaunch({ url: '/pages/login/index' }); },
});
