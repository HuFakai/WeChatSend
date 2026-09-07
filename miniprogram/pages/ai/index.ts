import { post, request } from '../../services/api';

Page({
  data: { options: null as any, mode: 'COPY', modes: ['生成文案', '生成模板', '生成任务草稿'], modeValues: ['COPY', 'TEMPLATE', 'TASK'], modeIndex: 0, modelIndex: 0, prompt: '', context: '', result: '', loading: false, error: '' },
  onLoad() { void request<any>('/mini/ai/options').then((options) => this.setData({ options })).catch((error) => this.setData({ error: (error as Error).message })); },
  modeChange(e: any) { const modeIndex = Number(e.detail.value); this.setData({ modeIndex, mode: this.data.modeValues[modeIndex], result: '' }); },
  modelChange(e: any) { this.setData({ modelIndex: Number(e.detail.value) }); },
  promptInput(e: any) { this.setData({ prompt: e.detail.value }); },
  contextInput(e: any) { this.setData({ context: e.detail.value }); },
  async generate() { if (!this.data.prompt.trim()) return this.setData({ error: '请先描述你的需求' }); const model = this.data.options?.models?.[this.data.modelIndex]; if (!model) return this.setData({ error: '暂无可用 AI 模型' }); this.setData({ loading: true, error: '', result: '' }); try { if (this.data.mode === 'TASK') { const draft = await post<any>('/mini/ai/task-draft', { mode: this.data.mode, modelId: model.id, prompt: this.data.prompt, context: this.data.context }); wx.navigateTo({ url: `/pages/task-new/index?draft=${draft.id}` }); return; } const result = await post<any>('/mini/ai/generate', { mode: this.data.mode, modelId: model.id, prompt: this.data.prompt, context: this.data.context }); this.setData({ result: result.content }); } catch (error) { this.setData({ error: (error as Error).message }); } finally { this.setData({ loading: false }); } },
});
