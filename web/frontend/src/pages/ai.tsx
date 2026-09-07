import { Bot, FileText, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/states';
import { api, post } from '@/lib/api';
import { AiOptions } from '@/types';

const modes = [
  { value: 'COPY', label: '生成文案', detail: '根据目标、场景和语气生成一段可编辑的微信文案。', icon: Sparkles },
  { value: 'TEMPLATE', label: '生成模板', detail: '生成可复用并支持变量的文案模板。', icon: FileText },
  { value: 'TASK', label: '生成任务草稿', detail: '只创建草稿，不会直接发送；账号、好友和时间仍需人工确认。', icon: Bot },
] as const;

export function AiPage() {
  const navigate = useNavigate();
  const [options, setOptions] = useState<AiOptions>(); const [mode, setMode] = useState<typeof modes[number]['value']>('COPY'); const [modelId, setModelId] = useState(''); const [prompt, setPrompt] = useState(''); const [context, setContext] = useState(''); const [result, setResult] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void api<AiOptions>('/ai/options').then((data) => { setOptions(data); setModelId(data.models[0]?.id || ''); }).catch((reason) => setError(reason.message)); }, []);
  const selected = modes.find((item) => item.value === mode)!;
  const generate = async () => { if (!prompt.trim() || !modelId) return setError('请先选择模型并描述你的需求'); setBusy(true); setError(''); setResult(''); try { if (mode === 'TASK') { const draft = await post<{ id: string }>('/ai/task-draft', { mode, modelId, prompt, context }); navigate(`/tasks/new?draft=${draft.id}`); return; } const data = await post<{ content: string }>('/ai/generate', { mode, modelId, prompt, context }); setResult(data.content); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } };
  if (!options && !error) return <LoadingState />;
  return <div className="page-enter space-y-6"><header><p className="font-mono text-[11px] uppercase tracking-[.22em] text-neutral-400">AI Studio</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">AI 助手</h1><p className="mt-2 text-sm text-neutral-500">生成结果只作为草稿，确认账号、好友和时间后才会进入发送队列。</p></header>{error && <ErrorState message={error} />}
    {options && !options.models.length && <Card className="border-dashed p-6"><p className="font-medium">尚未配置 AI 模型</p><p className="mt-2 text-sm text-neutral-500">请管理员在管理后台添加 OpenAI 兼容通道和模型。</p><Button asChild className="mt-4" variant="outline"><Link to="/admin">打开管理后台</Link></Button></Card>}
    {options && options.models.length > 0 && <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Card><CardHeader><CardTitle>选择工作方式</CardTitle></CardHeader><CardContent className="space-y-2">{modes.map((item) => <button key={item.value} type="button" onClick={() => { setMode(item.value); setResult(''); }} className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${mode === item.value ? 'border-black bg-black text-white' : 'border-neutral-200 hover:border-neutral-500'}`}><item.icon className="mt-0.5 h-4 w-4 shrink-0" /><span><b className="block text-sm">{item.label}</b><small className={mode === item.value ? 'text-neutral-400' : 'text-neutral-500'}>{item.detail}</small></span></button>)}<label className="block pt-4"><span className="field-label">使用模型</span><select className="select" value={modelId} onChange={(event) => setModelId(event.target.value)}>{options.models.map((model) => <option key={model.id} value={model.id}>{model.channelName} · {model.displayName}</option>)}</select></label></CardContent></Card><Card><CardHeader><CardTitle>{selected.label}</CardTitle></CardHeader><CardContent className="space-y-4"><label><span className="field-label">需求描述</span><textarea className="textarea min-h-36" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === 'TASK' ? '例如：为本周末的家居活动写一段温和的客户邀约' : '例如：给老客户写一段春节前的温馨问候，语气真诚简短'} /></label><label><span className="field-label">补充上下文（选填）</span><textarea className="textarea min-h-24" value={context} onChange={(event) => setContext(event.target.value)} placeholder="可填写产品、活动时间、价格等由你确认的事实" /></label><Button className="w-full" size="lg" disabled={busy} onClick={generate}>{busy ? '生成中…' : mode === 'TASK' ? '生成草稿并确认' : '生成内容'}</Button>{result && <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"><p className="mb-2 text-xs font-semibold text-neutral-400">候选结果</p><p className="whitespace-pre-wrap text-sm leading-7">{result}</p><Button className="mt-4" variant="outline" onClick={() => navigate(`/tasks/new?content=${encodeURIComponent(result)}`)}>使用这段内容创建任务</Button></div>}</CardContent></Card></div>}
  </div>;
}
