export type FeatureFlag = { key: string; enabled: boolean; config: Record<string, unknown> | null };
export type IntegrationVariableDraft = { name: string; displayName: string; responsePath: string };
export type ChannelDraft = { name: string; baseUrl: string; apiKey: string; model: string };
export type IntegrationDraft = {
  name: string;
  url: string;
  method: string;
  headers: string;
  params: string;
  variables: IntegrationVariableDraft[];
};
export const emptyChannel = (): ChannelDraft => ({ name: '', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '' });
export const emptyIntegration = (): IntegrationDraft => ({ name: '', url: '', method: 'GET', headers: '{}', params: '{}', variables: [{ name: '', displayName: '', responsePath: '' }] });
export const flagLabels: Record<string, string> = {
  mini_ai_copy: '小程序 AI 生成文案',
  mini_ai_template: '小程序 AI 生成模板',
  mini_ai_task: '小程序 AI 生成任务草稿',
  membership_required: '发送任务需要有效会员权益',
};
