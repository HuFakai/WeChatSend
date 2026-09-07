import { patch, post, request } from '../../services/api';
const split = (value: string) => value.split(/[，,；;\n\t]+/).map((item) => item.trim()).filter(Boolean);
Page({
  data: { items: [] as any[], builtIns: ['{{friend_name}}', '{{date}}', '{{time}}', '{{weekday}}'], showForm: false, editingId: '', name: '', displayName: '', mode: 'FIXED', modeIndex: 0, modes: ['固定值', '随机取值', '按好友顺序'], modeValues: ['FIXED', 'RANDOM', 'SEQUENCE'], raw: '', error: '' },
  onShow() { void this.load(); },
  async load() { try { const items=await request<any[]>('/variables'); this.setData({ items: items.map((item)=>({...item,token:`{{${item.name}}}`})) }); } catch (error) { this.setData({ error: (error as Error).message }); } },
  toggleForm() { this.setData({ showForm: !this.data.showForm, editingId: '', name: '', displayName: '', mode: 'FIXED', modeIndex: 0, raw: '' }); },
  input(e: any) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  modeChange(e: any) { const modeIndex = Number(e.detail.value); this.setData({ modeIndex, mode: this.data.modeValues[modeIndex] }); },
  edit(e:any) { const item=this.data.items.find((value:any)=>value.id===e.currentTarget.dataset.id); if(!item)return; const modeIndex=this.data.modeValues.indexOf(item.mode); this.setData({showForm:true,editingId:item.id,name:item.name,displayName:item.displayName,mode:item.mode,modeIndex,raw:item.values.map((value:any)=>value.value).join('\n')}); },
  async save() { const values = split(this.data.raw); if (!this.data.name.trim() || !this.data.displayName.trim() || !values.length) return; try { const body={ name: this.data.name, displayName: this.data.displayName, mode: this.data.mode, values }; this.data.editingId ? await patch(`/variables/${this.data.editingId}`,body) : await post('/variables', body); this.setData({ showForm: false, editingId: '', name: '', displayName: '', mode: 'FIXED', modeIndex: 0, raw: '' }); await this.load(); } catch (error) { this.setData({ error: (error as Error).message }); } },
});
