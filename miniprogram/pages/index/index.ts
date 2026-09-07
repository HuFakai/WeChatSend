import { request } from '../../services/api';
Page({
  data: { summary: {} as any, accepted: 0, error: '' },
  onShow() { void this.load(); },
  async load() { try { const summary = await request<any>('/tasks/summary'); this.setData({ summary, accepted: summary.messages?.ACCEPTED || 0 }); } catch (e) { this.setData({ error: (e as Error).message }); } },
  newTask() { wx.navigateTo({ url: '/pages/task-new/index' }); },
  accounts() { wx.navigateTo({ url: '/pages/accounts/index' }); },
  friends() { wx.navigateTo({ url: '/pages/friends/index' }); },
  ai() { wx.navigateTo({ url: '/pages/ai/index' }); },
});
