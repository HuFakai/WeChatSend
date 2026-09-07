import { request } from '../../services/api';
Page({
  data: { items: [] as any[], error: '', statusText: { SCHEDULED: '等待定时', RUNNING: '处理中', COMPLETED: '处理完成', PARTIAL: '部分完成', FAILED: '处理失败', CANCELLED: '已取消' } as Record<string,string> },
  onShow() { void this.load(); },
  async load() { try { const items = await request<any[]>('/tasks'); this.setData({ items: items.map((item) => ({ ...item, scheduledAtText: new Date(item.scheduledAt).toLocaleString() })) }); } catch (e) { this.setData({ error: (e as Error).message }); } },
  create() { wx.navigateTo({ url: '/pages/task-new/index' }); },
  detail(e: any) { wx.navigateTo({ url: `/pages/task-detail/index?id=${e.currentTarget.dataset.id}` }); },
});
