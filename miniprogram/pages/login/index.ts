import { post } from '../../services/api';

Page({
  data: { username: '', password: '', loading: false, error: '' },
  usernameInput(e: WechatMiniprogram.Input) { this.setData({ username: e.detail.value }); },
  passwordInput(e: WechatMiniprogram.Input) { this.setData({ password: e.detail.value }); },
  async login() {
    this.setData({ loading: true, error: '' });
    try {
      const result = await post<{ token: string }>('/auth/login', { username: this.data.username, password: this.data.password });
      wx.setStorageSync('wechatsend_token', result.token);
      wx.switchTab({ url: '/pages/index/index' });
    } catch (error) { this.setData({ error: (error as Error).message }); }
    finally { this.setData({ loading: false }); }
  },
});
