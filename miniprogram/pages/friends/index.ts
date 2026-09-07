import { patch, post, request } from '../../services/api';
const split = (value: string) => [...new Set(value.split(/[，,；;\n\t]+/).map((v) => v.trim()).filter(Boolean))];
Page({
  data: { accounts: [] as any[], accountNames: [] as string[], accountIndex: 0, items: [] as any[], raw: '', parsedCount: 0, showForm: false, error: '' },
  onShow() { void this.init(); },
  async init() { try { const accounts = await request<any[]>('/accounts'); this.setData({ accounts, accountNames: accounts.map((a) => a.name) }); if (accounts.length) await this.load(); } catch (e) { this.setData({ error: (e as Error).message }); } },
  async load() { const account = this.data.accounts[this.data.accountIndex]; if (account) this.setData({ items: await request<any[]>(`/accounts/${account.id}/friends`) }); },
  async accountChange(e: any) { this.setData({ accountIndex: Number(e.detail.value), showForm: false }); await this.load(); },
  toggleForm() { this.setData({ showForm: !this.data.showForm }); },
  rawInput(e: any) { this.setData({ raw: e.detail.value, parsedCount: split(e.detail.value).length }); },
  async create() { const account = this.data.accounts[this.data.accountIndex]; try { await post(`/accounts/${account.id}/friends/bulk`, { remarks: split(this.data.raw) }); this.setData({ raw: '', parsedCount: 0, showForm: false }); await this.load(); } catch (e) { this.setData({ error: (e as Error).message }); } },
  edit(e: any) { const id = e.currentTarget.dataset.id; wx.showModal({ title: '编辑好友备注', editable: true, content: e.currentTarget.dataset.remark, placeholderText: '微信好友备注', success: async (result) => { if (!result.confirm || !result.content?.trim()) return; try { await patch(`/friends/${id}`, { remark: result.content.trim() }); await this.load(); } catch (error) { wx.showToast({ title: (error as Error).message, icon: 'none' }); } } }); },
  async toggle(e: any) { await patch(`/friends/${e.currentTarget.dataset.id}`, { status: e.currentTarget.dataset.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }); await this.load(); },
});
