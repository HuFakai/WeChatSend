import { post, request } from '../../services/api';

Page({
  data: { options: null as any, modes: [] as string[], modeValues: [] as string[], mode: '', modeIndex: 0, modelIndex: 0, prompt: '', context: '', result: '', loading: false, error: '' },
  onLoad() {
    void request<any>('/mini/ai/options').then((options) => {
      const definitions = [
        { value: 'COPY', label: '生成文案', key: 'mini_ai_copy' },
        { value: 'TEMPLATE', label: '生成模板', key: 'mini_ai_template' },
        { value: 'TASK', label: '生成任务草稿', key: 'mini_ai_task' },
      ];
      const available = definitions.filter((item) => options.features?.[item.key]);
      this.setData({ options, modes: available.map((item) => item.label), modeValues: available.map((item) => item.value), mode: available[0]?.value || '', modeIndex: 0 });
    }).catch((error) => this.setData({ error: (error as Error).message }));
  },
  modeChange(e: any) { const modeIndex = Number(e.detail.value); this.setData({ modeIndex, mode: this.data.modeValues[modeIndex], result: '' }); },
  modelChange(e: any) { this.setData({ modelIndex: Number(e.detail.value) }); },
  promptInput(e: any) { this.setData({ prompt: e.detail.value }); },
  contextInput(e: any) { this.setData({ context: e.detail.value }); },
  async generate() { if (!this.data.mode) return this.setData({ error: '管理员尚未开启 AI 功能' }); if (!this.data.prompt.trim()) return this.setData({ error: '请先描述你的需求' }); const model = this.data.options?.models?.[this.data.modelIndex]; if (!model) return this.setData({ error: '暂无可用 AI 模型' }); this.setData({ loading: true, error: '', result: '' }); try { if (this.data.mode === 'TASK') { const draft = await post<any>('/mini/ai/task-draft', { mode: this.data.mode, modelId: model.id, prompt: this.data.prompt, context: this.data.context }); wx.navigateTo({ url: `/pages/task-new/index?draft=${draft.id}` }); return; } const result = await post<any>('/mini/ai/generate', { mode: this.data.mode, modelId: model.id, prompt: this.data.prompt, context: this.data.context }); this.setData({ result: result.content }); } catch (error) { this.setData({ error: (error as Error).message }); } finally { this.setData({ loading: false }); } },
});
