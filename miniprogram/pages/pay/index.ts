import { post, request } from '../../services/api';

Page({
  data: { scene: '', order: null as any, loading: false, error: '', paid: false },
  onLoad(options: any) { const scene = options.scene || wx.getStorageSync('wechatsend_pending_scene'); if (!scene) return this.setData({ error: '付款二维码缺少订单信息' }); this.setData({ scene }); void request<any>(`/payments/scan/${encodeURIComponent(scene)}`).then((order) => this.setData({ order })).catch((error) => this.setData({ error: (error as Error).message })); },
  async pay() { if (!this.data.order) return; this.setData({ loading: true, error: '' }); try { const params = await post<any>(`/payments/orders/${this.data.order.id}/checkout`); await new Promise<void>((resolve, reject) => wx.requestPayment({ ...params, success: () => resolve(), fail: reject })); this.setData({ paid: true }); wx.removeStorageSync('wechatsend_pending_scene'); } catch (error) { this.setData({ error: (error as Error).message || '支付未完成' }); } finally { this.setData({ loading: false }); } },
});
