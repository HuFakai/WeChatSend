import { post, request } from '../../services/api';

Page({
  data: { scene: '', order: null as any, loading: false, error: '', paid: false },
  onLoad(options: any) { const scene = options.scene || wx.getStorageSync('wechatsend_pending_scene'); if (!scene) return this.setData({ error: '付款二维码缺少订单信息' }); this.setData({ scene }); void request<any>(`/payments/scan/${encodeURIComponent(scene)}`).then((order) => this.setData({ order })).catch((error) => this.setData({ error: (error as Error).message })); },
  async waitForCallback(orderId: string) { for (let attempt = 0; attempt < 8; attempt += 1) { const order = await request<any>(`/payments/orders/${orderId}`); if (order.status === 'SUCCESS') return true; if (['FAILED', 'CLOSED', 'REFUNDED'].includes(order.status)) return false; await new Promise((resolve) => setTimeout(resolve, 1000)); } return false; },
  async pay() { if (!this.data.order) return; this.setData({ loading: true, error: '' }); try { const params = await post<any>(`/payments/orders/${this.data.order.id}/checkout`); await new Promise<void>((resolve, reject) => wx.requestPayment({ ...params, success: () => resolve(), fail: reject })); const paid = await this.waitForCallback(this.data.order.id); if (paid) { this.setData({ paid: true }); wx.removeStorageSync('wechatsend_pending_scene'); } else this.setData({ error: '支付已完成操作，但服务端尚未确认结果，请稍后在订单记录中查看。' }); } catch (error) { this.setData({ error: (error as Error).message || '支付未完成' }); } finally { this.setData({ loading: false }); } },
});
