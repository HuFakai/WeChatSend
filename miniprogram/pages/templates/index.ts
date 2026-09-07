import { patch, post, request } from '../../services/api';
Page({
  data: { items: [] as any[], showForm: false, editingId: '', title: '', category: '', content: '', error: '' },
  onShow() { void this.load(); },
  async load() { try { this.setData({ items: await request<any[]>('/templates') }); } catch (error) { this.setData({ error: (error as Error).message }); } },
  toggleForm() { this.setData({ showForm: !this.data.showForm, editingId: '', title: '', category: '', content: '' }); },
  input(e: any) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  edit(e:any) { const item=this.data.items.find((value:any)=>value.id===e.currentTarget.dataset.id); if(item)this.setData({showForm:true,editingId:item.id,title:item.title,category:item.category||'',content:item.content}); },
  async save() { if (!this.data.title.trim() || !this.data.content.trim()) return; try { const body={ title: this.data.title, category: this.data.category || null, content: this.data.content }; this.data.editingId ? await patch(`/templates/${this.data.editingId}`,body) : await post('/templates', body); this.setData({showForm:false,editingId:'',title:'',category:'',content:''}); await this.load(); } catch (error) { this.setData({ error: (error as Error).message }); } },
  async favorite(e: any) { await post(`/templates/${e.currentTarget.dataset.id}/favorite`); await this.load(); },
  async copy(e: any) { await post(`/templates/${e.currentTarget.dataset.id}/copy`); await this.load(); wx.showToast({ title: '已复制到我的模板' }); },
  use(e: any) { wx.navigateTo({ url: `/pages/task-new/index?template=${e.currentTarget.dataset.id}` }); },
});
