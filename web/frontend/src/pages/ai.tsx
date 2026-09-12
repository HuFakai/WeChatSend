import { ArrowUpRight, Bot, FileText, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '@/components/page';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AiOptions } from '@/types';

const modes = [
  { value: 'COPY', label: '生成文案', detail: '根据场景和语气生成一段可编辑的微信文案。', icon: Sparkles },
  { value: 'TEMPLATE', label: '生成模板', detail: '生成支持内容变量的可复用模板。', icon: FileText },
  { value: 'TASK', label: '生成任务草稿', detail: '只创建草稿，发送对象和时间仍需人工确认。', icon: Bot },
] as const;

export function AiPage() {
  const navigate = useNavigate();
  const [options, setOptions] = useState<AiOptions>();
  const [mode, setMode] = useState<(typeof modes)[number]['value']>('COPY');
  const [modelId, setModelId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [context, setContext] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void api<AiOptions>('/ai/options').then((data) => { setOptions(data); setModelId(data.models[0]?.id || ''); }).catch((reason) => setError(reason.message)); }, []);
  const selected = modes.find((item) => item.value === mode)!;
  const generate = async () => {
    if (!prompt.trim() || !modelId) { setError('请先选择模型并描述需求'); return; }
    setBusy(true); setError(''); setResult('');
    try {
      if (mode === 'TASK') { const draft = await post<{ id: string }>('/ai/task-draft', { mode, modelId, prompt, context }); navigate(`/tasks/new?draft=${draft.id}`); return; }
      const data = await post<{ content: string }>('/ai/generate', { mode, modelId, prompt, context }); setResult(data.content);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  if (!options && !error) return <LoadingState />;
  return <Page>
    <PageHeader eyebrow="AI writing studio" title="AI 助手" description="AI 只负责生成候选内容或任务草稿；未经确认的结果永远不会进入发送队列。" />
    {error ? <ErrorState message={error} /> : null}
    {options && !options.models.length ? <Card className="border-dashed p-6"><p className="font-medium">尚未配置 AI 模型</p><p className="mt-2 text-sm text-neutral-500">请管理员先添加 OpenAI 兼容通道和模型。</p><Button asChild className="mt-4" variant="outline"><Link to="/admin">打开管理后台</Link></Button></Card> : null}
    {options?.models.length ? <div className="grid gap-5 lg:grid-cols-[minmax(280px,.65fr)_minmax(0,1.35fr)]">
      <Card><CardHeader><CardTitle>工作方式</CardTitle></CardHeader><CardContent className="space-y-2">{modes.map((item) => <button key={item.value} type="button" onClick={() => { setMode(item.value); setResult(''); }} className={cn('flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors', mode === item.value ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 hover:border-neutral-500')}><item.icon className="mt-0.5 h-4 w-4 shrink-0" /><span><b className="block text-sm">{item.label}</b><small className={mode === item.value ? 'text-neutral-400' : 'text-neutral-500'}>{item.detail}</small></span></button>)}<label className="block pt-4"><span className="field-label">使用模型</span><select className="select" value={modelId} onChange={(event) => setModelId(event.target.value)}>{options.models.map((model) => <option key={model.id} value={model.id}>{model.channelName} · {model.displayName}</option>)}</select></label></CardContent></Card>
      <Card><CardHeader><CardTitle>{selected.label}</CardTitle></CardHeader><CardContent className="space-y-4"><label><span className="field-label">需求描述</span><textarea className="textarea min-h-40" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === 'TASK' ? '例如：为本周末家居活动创建一条温和的客户邀约任务' : '例如：给老客户写一段春节前的温馨问候，语气真诚简短'} /></label><label><span className="field-label">事实与上下文（选填）</span><textarea className="textarea min-h-28" value={context} onChange={(event) => setContext(event.target.value)} placeholder="填写产品、活动时间和价格等需要保持准确的信息" /></label><Button className="w-full" size="lg" disabled={busy} onClick={() => void generate()}>{busy ? '正在生成' : mode === 'TASK' ? '生成任务草稿' : '生成候选内容'}</Button>{result ? <div className="rounded-xl border border-neutral-300 bg-neutral-50 p-5"><p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-neutral-400">Generated draft</p><p className="whitespace-pre-wrap text-sm leading-7">{result}</p><Button className="mt-5" variant="outline" onClick={() => navigate(`/tasks/new?content=${encodeURIComponent(result)}`)}>使用这段内容 <ArrowUpRight className="h-4 w-4" /></Button></div> : null}</CardContent></Card>
    </div> : null}
  </Page>;
}
