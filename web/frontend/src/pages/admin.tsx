import { Check, Clipboard, ExternalLink, KeyRound, Plus, Power, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/states';
import { api, patch, post } from '@/lib/api';
import { AiChannel, ApiIntegration } from '@/types';

type Flag = { key: string; enabled: boolean; config: Record<string, unknown> | null };
type IntegrationVariableDraft = { name: string; displayName: string; responsePath: string };

const flagLabels: Record<string, string> = {
  mini_ai_copy: '小程序 AI 生成文案',
  mini_ai_template: '小程序 AI 生成模板',
  mini_ai_task: '小程序 AI 生成任务草稿',
  membership_required: '发送任务需要有效会员权益',
};

const emptyIntegration = () => ({
  name: '', url: '', method: 'GET', headers: '{}', params: '{}',
  variables: [{ name: '', displayName: '', responsePath: '' }] as IntegrationVariableDraft[],
});

export function AdminPage() {
  const [flags, setFlags] = useState<Flag[]>();
  const [channels, setChannels] = useState<AiChannel[]>();
  const [integrations, setIntegrations] = useState<ApiIntegration[]>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState({ name: '', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '' });
  const [integration, setIntegration] = useState(emptyIntegration);
  const [payment, setPayment] = useState({ amountFen: '1', description: 'WeChatSend 测试付款' });
  const [qr, setQr] = useState('');

  const load = async () => {
    setError('');
    try {
      const [flagData, channelData, apiData] = await Promise.all([
        api<Flag[]>('/admin/feature-flags'),
        api<AiChannel[]>('/admin/ai/channels'),
        api<ApiIntegration[]>('/admin/integrations'),
      ]);
      setFlags(flagData);
      setChannels(channelData);
      setIntegrations(apiData);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  useEffect(() => { void load(); }, []);

  const saveChannel = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/admin/ai/channels', {
        name: channel.name.trim(),
        baseUrl: channel.baseUrl.trim(),
        apiKey: channel.apiKey,
        models: channel.model.trim() ? [{ name: channel.model.trim() }] : [],
      });
      setChannel({ name: '', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '' });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addModel = async (channelId: string) => {
    const name = window.prompt('请输入模型名称，例如 gpt-4o-mini')?.trim();
    if (!name) return;
    const displayName = window.prompt('显示名称（可选）', name)?.trim() || undefined;
    setBusy(true);
    setError('');
    try {
      await post(`/admin/ai/channels/${channelId}/models`, { name, displayName });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleChannel = async (item: AiChannel) => {
    setBusy(true);
    setError('');
    try {
      await patch(`/admin/ai/channels/${item.id}`, { isActive: !item.isActive });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleModel = async (model: AiChannel['models'][number]) => {
    setBusy(true);
    setError('');
    try {
      await patch(`/admin/ai/models/${model.id}`, { isActive: !model.isActive });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const testModel = async (model: AiChannel['models'][number]) => {
    const prompt = window.prompt('请输入测试提示词', '请写一句简短的客户问候语')?.trim();
    if (!prompt) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await post<{ content: string }>('/admin/ai/test', { modelId: model.id, prompt });
      setNotice(`AI 测试成功：${result.content}`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const parseJsonObject = (raw: string, label: string) => {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error(`${label}必须是有效 JSON`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是 JSON 对象`);
    return value as Record<string, unknown>;
  };

  const saveIntegration = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const requestParams = parseJsonObject(integration.params, '请求参数');
      const headers = parseJsonObject(integration.headers, '请求头');
      if (Object.values(headers).some((value) => typeof value !== 'string')) throw new Error('请求头的值必须是字符串');
      const variables = integration.variables.map((item) => ({
        name: item.name.trim(), displayName: item.displayName.trim(), responsePath: item.responsePath.trim(),
      }));
      if (variables.some((item) => !item.name || !item.displayName || !item.responsePath)) throw new Error('请完整填写每个响应变量');
      await post('/admin/integrations', {
        name: integration.name.trim(), url: integration.url.trim(), method: integration.method,
        headers: headers as Record<string, string>, requestParams, variables,
      });
      setIntegration(emptyIntegration());
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const testIntegration = async (id: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await post<{ variables: Array<{ name: string; responsePath: string; value: string | null }> }>(`/admin/integrations/${id}/test`);
      setNotice(`API 测试成功：${result.variables.map((item) => `{{${item.name}}}=${item.value ?? '未取到值'}（${item.responsePath}）`).join('；')}`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createQr = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await post<{ qrDataUrl: string }>('/payments/qr', { amountFen: Number(payment.amountFen), description: payment.description });
      setQr(result.qrDataUrl);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateVariable = (index: number, key: keyof IntegrationVariableDraft, value: string) => {
    setIntegration((current) => ({ ...current, variables: current.variables.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  };

  if (!flags || !channels || !integrations) return error ? <ErrorState message={error} retry={load} /> : <LoadingState />;

  return <div className="page-enter space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="font-mono text-[11px] uppercase tracking-[.22em] text-neutral-400">Admin Console</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">平台配置</h1><p className="mt-2 text-sm text-neutral-500">密钥只写入服务端加密字段，列表和日志不会返回明文。</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><Link to="/admin/payment">支付与套餐</Link></Button><Button asChild variant="outline"><Link to="/admin/templates">内容库审核</Link></Button><Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />刷新</Button></div>
    </header>
    {error && <ErrorState message={error} />}
    {notice && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</div>}

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" />小程序 AI 开关</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">{flags.map((flag) => <button key={flag.key} className={`rounded-lg border p-4 text-left ${flag.enabled ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-neutral-200'}`} onClick={async () => { try { const next = await patch<Flag>(`/admin/feature-flags/${flag.key}`, { enabled: !flag.enabled }); setFlags((items) => (items ?? []).map((item) => item.key === flag.key ? next : item)); } catch (reason) { setError((reason as Error).message); } }}><span className="flex items-center justify-between"><b className="text-sm">{flagLabels[flag.key] || flag.key}</b>{flag.enabled && <Check className="h-4 w-4" />}</span><span className={flag.enabled ? 'text-xs text-emerald-100' : 'text-xs text-neutral-500'}>{flag.enabled ? '已开启' : '已关闭'}</span></button>)}</CardContent>
    </Card>

    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />AI 通道与模型</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">{channels.map((item) => <div key={item.id} className="rounded-lg border border-neutral-200 p-4">
            <div className="flex items-center justify-between gap-2"><b>{item.name}</b><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void toggleChannel(item)}><Power className="h-3.5 w-3.5" />{item.isActive ? '停用通道' : '启用通道'}</Button></div>
            <p className="mt-1 truncate font-mono text-xs text-neutral-400">{item.baseUrl}</p>
            <p className="mt-3 text-xs text-neutral-500">{item.hasApiKey ? 'API Key 已配置' : '未配置密钥'} · {item.isActive ? '通道启用' : '通道停用'}</p>
            <div className="mt-3 space-y-2">{item.models.map((model) => <div key={model.id} className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-3 py-2 text-xs"><span><span className="font-medium">{model.displayName || model.name}</span><span className="ml-2 font-mono text-neutral-400">{model.name}</span></span><span className="flex shrink-0 gap-1"><Button type="button" size="sm" variant="ghost" disabled={busy || !model.isActive || !item.isActive} onClick={() => void testModel(model)}>测试</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void toggleModel(model)}>{model.isActive ? '停用' : '启用'}</Button></span></div>)}</div>
            <Button type="button" size="sm" variant="outline" className="mt-3" disabled={busy} onClick={() => void addModel(item.id)}><Plus className="h-3.5 w-3.5" />添加模型</Button>
          </div>)}{!channels.length && <p className="text-sm text-neutral-500">还没有通道。</p>}</div>
          <form className="mt-5 space-y-3 border-t border-neutral-100 pt-5" onSubmit={saveChannel}><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">添加 OpenAI 兼容通道</p><InputRow label="名称" value={channel.name} onChange={(value) => setChannel({ ...channel, name: value })} placeholder="OpenAI 主通道" /><InputRow label="Base URL（需包含 /v1）" value={channel.baseUrl} onChange={(value) => setChannel({ ...channel, baseUrl: value })} placeholder="https://api.openai.com/v1" /><InputRow label="API Key" value={channel.apiKey} onChange={(value) => setChannel({ ...channel, apiKey: value })} placeholder="sk-..." type="password" /><InputRow label="首个模型名" value={channel.model} onChange={(value) => setChannel({ ...channel, model: value })} placeholder="gpt-4o-mini" /><Button className="w-full" disabled={busy}><Plus className="h-4 w-4" />保存通道</Button></form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ExternalLink className="h-4 w-4" />外部 API 变量</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">{integrations.map((item) => <div key={item.id} className="rounded-lg border border-neutral-200 p-4"><div className="flex items-center justify-between gap-2"><b>{item.name}</b><span className="text-xs text-neutral-500">{item.method} · {item.enabled ? '启用' : '停用'}</span></div><p className="mt-1 truncate font-mono text-xs text-neutral-400">{item.url}</p><div className="mt-3 flex flex-wrap gap-1.5">{item.variables.map((variable) => <span key={variable.id} className="rounded bg-neutral-100 px-2 py-1 font-mono text-[11px]">{'{{'}{variable.name}{'}}'} → {variable.responsePath}</span>)}</div><Button type="button" size="sm" variant="outline" className="mt-3" disabled={busy} onClick={() => void testIntegration(item.id)}>测试请求</Button></div>)}{!integrations.length && <p className="text-sm text-neutral-500">例如配置天气 API，再将多个响应路径映射成多个变量。</p>}</div>
          <form className="mt-5 space-y-3 border-t border-neutral-100 pt-5" onSubmit={saveIntegration}><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">添加 API 与响应变量</p><InputRow label="名称" value={integration.name} onChange={(value) => setIntegration({ ...integration, name: value })} placeholder="今日天气" /><InputRow label="URL" value={integration.url} onChange={(value) => setIntegration({ ...integration, url: value })} placeholder="https://example.com/weather" /><label><span className="field-label">方法</span><select className="select" value={integration.method} onChange={(event) => setIntegration({ ...integration, method: event.target.value })}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option></select></label><label><span className="field-label">请求头 JSON（选填）</span><textarea className="textarea min-h-20 font-mono text-xs" value={integration.headers} onChange={(event) => setIntegration({ ...integration, headers: event.target.value })} /></label><label><span className="field-label">请求参数 JSON</span><textarea className="textarea min-h-20 font-mono text-xs" value={integration.params} onChange={(event) => setIntegration({ ...integration, params: event.target.value })} /></label>
            <div className="space-y-3"><div className="flex items-center justify-between"><span className="field-label mb-0">响应变量（可添加多个）</span><Button type="button" size="sm" variant="outline" onClick={() => setIntegration((current) => ({ ...current, variables: [...current.variables, { name: '', displayName: '', responsePath: '' }] }))}><Plus className="h-3.5 w-3.5" />添加变量</Button></div>{integration.variables.map((variable, index) => <div key={index} className="rounded-lg border border-neutral-200 p-3"><div className="mb-2 flex items-center justify-between text-xs font-semibold text-neutral-500">变量 {index + 1}{integration.variables.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setIntegration((current) => ({ ...current, variables: current.variables.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-3.5 w-3.5" />删除</Button>}</div><div className="grid gap-3 sm:grid-cols-2"><InputRow label="变量名（英文）" value={variable.name} onChange={(value) => updateVariable(index, 'name', value)} placeholder="weather_text" /><InputRow label="显示名称" value={variable.displayName} onChange={(value) => updateVariable(index, 'displayName', value)} placeholder="天气" /></div><div className="mt-3"><InputRow label="响应路径" value={variable.responsePath} onChange={(value) => updateVariable(index, 'responsePath', value)} placeholder="data.weather.text" /></div></div>)}</div>
            <Button className="w-full" disabled={busy}><Plus className="h-4 w-4" />保存外部 API</Button>
          </form>
        </CardContent>
      </Card>
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clipboard className="h-4 w-4" />生成小程序付款二维码</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end"><InputRow label="金额（分）" value={payment.amountFen} onChange={(value) => setPayment({ ...payment, amountFen: value })} type="number" /><InputRow label="订单描述" value={payment.description} onChange={(value) => setPayment({ ...payment, description: value })} /><Button disabled={busy} onClick={createQr}>生成二维码</Button></div>{qr && <div className="mt-5 flex flex-col items-center gap-3 border-t border-neutral-100 pt-5"><img className="h-56 w-56 border border-neutral-200 p-2" src={qr} alt="小程序付款二维码" /><p className="text-xs text-neutral-500">用户扫码后进入小程序，授权昵称头像并调起微信支付。</p></div>}</CardContent></Card>
  </div>;
}

function InputRow({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block"><span className="field-label">{label}</span><input className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required /></label>;
}
