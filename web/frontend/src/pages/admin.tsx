import { CreditCard, Library, RefreshCw } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '@/components/dialog';
import { FormField } from '@/components/form-field';
import { Page, PageHeader } from '@/components/page';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/toast';
import { AiChannelsPanel, FeatureFlagsPanel, IntegrationsPanel, PaymentQrPanel } from '@/features/admin-console/sections';
import { emptyChannel, emptyIntegration, type FeatureFlag } from '@/features/admin-console/types';
import { useResource } from '@/hooks/use-resource';
import { api, patch, post } from '@/lib/api';
import type { AiChannel, ApiIntegration } from '@/types';

type AdminData = { flags: FeatureFlag[]; channels: AiChannel[]; integrations: ApiIntegration[] };
type Model = AiChannel['models'][number];

export function AdminPage() {
  const resource = useResource<AdminData>(async () => {
    const [flags, channels, integrations] = await Promise.all([
      api<FeatureFlag[]>('/admin/feature-flags'),
      api<AiChannel[]>('/admin/ai/channels'),
      api<ApiIntegration[]>('/admin/integrations'),
    ]);
    return { flags, channels, integrations };
  }, []);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState(emptyChannel);
  const [integration, setIntegration] = useState(emptyIntegration);
  const [payment, setPayment] = useState({ amountFen: '1', description: 'WeChatSend 测试付款' });
  const [qr, setQr] = useState('');
  const [modelDraft, setModelDraft] = useState<{ channelId: string; name: string; displayName: string }>();
  const [modelTest, setModelTest] = useState<{ model: Model; prompt: string }>();
  const fail = (reason: unknown) => resource.setError((reason as Error).message);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); resource.setError('');
    try { await action(); }
    catch (reason) { fail(reason); }
    finally { setBusy(false); }
  };
  const saveChannel = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await post('/admin/ai/channels', { name: channel.name.trim(), baseUrl: channel.baseUrl.trim(), apiKey: channel.apiKey, models: channel.model.trim() ? [{ name: channel.model.trim() }] : [] });
      setChannel(emptyChannel()); await resource.reload();
    });
  };
  const saveModel = (event: FormEvent) => {
    event.preventDefault();
    if (!modelDraft?.name.trim()) return;
    void run(async () => {
      await post(`/admin/ai/channels/${modelDraft.channelId}/models`, { name: modelDraft.name.trim(), displayName: modelDraft.displayName.trim() || undefined });
      setModelDraft(undefined); await resource.reload();
    });
  };
  const testModel = (event: FormEvent) => {
    event.preventDefault();
    if (!modelTest?.prompt.trim()) return;
    void run(async () => {
      const result = await post<{ content: string }>('/admin/ai/test', { modelId: modelTest.model.id, prompt: modelTest.prompt.trim() });
      toast({ title: 'AI 测试成功', description: result.content, tone: 'success' }); setModelTest(undefined);
    });
  };
  const toggleChannel = (item: AiChannel) => void run(async () => { await patch(`/admin/ai/channels/${item.id}`, { isActive: !item.isActive }); await resource.reload(); });
  const toggleModel = (model: Model) => void run(async () => { await patch(`/admin/ai/models/${model.id}`, { isActive: !model.isActive }); await resource.reload(); });
  const toggleFlag = (flag: FeatureFlag) => void run(async () => {
    const next = await patch<FeatureFlag>(`/admin/feature-flags/${flag.key}`, { enabled: !flag.enabled });
    resource.setData((current) => current ? { ...current, flags: current.flags.map((item) => item.key === flag.key ? next : item) } : current);
  });
  const parseJsonObject = (raw: string, label: string) => {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error(`${label}必须是有效 JSON`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是 JSON 对象`);
    return value as Record<string, unknown>;
  };
  const saveIntegration = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const requestParams = parseJsonObject(integration.params, '请求参数');
      const headers = parseJsonObject(integration.headers, '请求头');
      if (Object.values(headers).some((value) => typeof value !== 'string')) throw new Error('请求头的值必须是字符串');
      const variables = integration.variables.map((item) => ({ name: item.name.trim(), displayName: item.displayName.trim(), responsePath: item.responsePath.trim() }));
      if (variables.some((item) => !item.name || !item.displayName || !item.responsePath)) throw new Error('请完整填写每个响应变量');
      await post('/admin/integrations', { name: integration.name.trim(), url: integration.url.trim(), method: integration.method, headers, requestParams, variables });
      setIntegration(emptyIntegration()); await resource.reload();
    });
  };
  const testIntegration = (id: string) => void run(async () => {
    const result = await post<{ variables: Array<{ name: string; responsePath: string; value: string | null }> }>(`/admin/integrations/${id}/test`);
    toast({ title: 'API 测试成功', description: result.variables.map((item) => `{{${item.name}}}=${item.value ?? '未取到值'}（${item.responsePath}）`).join('；'), tone: 'success', duration: 8000 });
  });
  const createQr = () => void run(async () => { const result = await post<{ qrDataUrl: string }>('/payments/qr', { amountFen: Number(payment.amountFen), description: payment.description }); setQr(result.qrDataUrl); });

  if (resource.loading && !resource.data) return <LoadingState />;
  const data = resource.data;
  if (!data) return <ErrorState message={resource.error || '平台配置加载失败'} retry={resource.reload} />;

  return <Page>
    <PageHeader eyebrow="Admin console" title="平台配置" description="集中管理业务开关、AI 通道和外部变量。所有密钥只写入服务端加密字段，不在页面和日志中回显。" actions={<><Button asChild variant="outline"><Link to="/admin/payment"><CreditCard className="h-4 w-4" />支付与套餐</Link></Button><Button asChild variant="outline"><Link to="/admin/templates"><Library className="h-4 w-4" />内容库审核</Link></Button><Button variant="outline" onClick={() => void resource.reload()}><RefreshCw className="h-4 w-4" />刷新</Button></>} />
    {resource.error ? <ErrorState message={resource.error} /> : null}
    <FeatureFlagsPanel flags={data.flags} onToggle={toggleFlag} />
    <div className="grid items-start gap-5 xl:grid-cols-2"><AiChannelsPanel channels={data.channels} draft={channel} busy={busy} onDraft={setChannel} onSave={saveChannel} onToggleChannel={toggleChannel} onToggleModel={toggleModel} onAddModel={(channelId) => setModelDraft({ channelId, name: '', displayName: '' })} onTestModel={(model) => setModelTest({ model, prompt: '请写一句简短的客户问候语' })} /><IntegrationsPanel items={data.integrations} draft={integration} busy={busy} onDraft={setIntegration} onSave={saveIntegration} onTest={testIntegration} /></div>
    <PaymentQrPanel {...payment} qr={qr} busy={busy} onChange={setPayment} onCreate={createQr} />

    <Dialog open={Boolean(modelDraft)} onClose={() => setModelDraft(undefined)} title="添加模型" description="模型名必须与上游 OpenAI 兼容接口提供的标识一致。" className="max-w-md">{modelDraft ? <form className="space-y-4" onSubmit={saveModel}><FormField label="模型名称" required><Input autoFocus value={modelDraft.name} onChange={(event) => setModelDraft({ ...modelDraft, name: event.target.value })} placeholder="gpt-4o-mini" /></FormField><FormField label="显示名称"><Input value={modelDraft.displayName} onChange={(event) => setModelDraft({ ...modelDraft, displayName: event.target.value })} placeholder="快速文案模型" /></FormField><Button className="w-full" disabled={busy || !modelDraft.name.trim()}>保存模型</Button></form> : null}</Dialog>
    <Dialog open={Boolean(modelTest)} onClose={() => setModelTest(undefined)} title="测试 AI 模型" description={modelTest ? `当前模型：${modelTest.model.displayName || modelTest.model.name}` : undefined} className="max-w-md">{modelTest ? <form className="space-y-4" onSubmit={testModel}><FormField label="测试提示词" required><textarea className="textarea min-h-32" autoFocus value={modelTest.prompt} onChange={(event) => setModelTest({ ...modelTest, prompt: event.target.value })} /></FormField><Button className="w-full" disabled={busy || !modelTest.prompt.trim()}>发送测试</Button></form> : null}</Dialog>
  </Page>;
}
