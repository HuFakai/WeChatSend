import { Bookmark, Copy, Eye, Plus, Sparkles, Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeleteConfirm } from '@/components/delete-confirm';
import { Dialog } from '@/components/dialog';
import { FormField } from '@/components/form-field';
import { Page, PageHeader } from '@/components/page';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { builtInVariables } from '@/features/task-builder/types';
import { useResource } from '@/hooks/use-resource';
import { api, patch, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CustomVariable, MessageTemplate } from '@/types';

type TemplateTab = 'ALL' | 'PLATFORM' | 'USER' | 'FAVORITE';
type TemplatePreview = { content: string; resolved: Record<string, string> };
const tabs: ReadonlyArray<[TemplateTab, string]> = [['ALL', '全部'], ['PLATFORM', '平台精选'], ['USER', '我的模板'], ['FAVORITE', '已收藏']];

export function TemplatesPage() {
  const navigate = useNavigate();
  const templates = useResource(() => api<MessageTemplate[]>('/templates'), []);
  const variables = useResource(() => api<CustomVariable[]>('/variables'), []);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<TemplateTab>('ALL');
  const [editing, setEditing] = useState<Partial<MessageTemplate>>();
  const [preview, setPreview] = useState<TemplatePreview>();
  const [busy, setBusy] = useState(false);
  const visible = useMemo(() => templates.data?.filter((item) => tab === 'ALL' || (tab === 'FAVORITE' ? item.favorite : item.scope === tab)), [templates.data, tab]);

  const closeEditor = () => { setEditing(undefined); setPreview(undefined); };
  const updateContent = (content: string) => { if (editing) setEditing({ ...editing, content }); setPreview(undefined); };
  const insertVariable = (name: string) => {
    if (!editing) return;
    const content = editing.content ?? '';
    const start = editorRef.current?.selectionStart ?? content.length;
    const end = editorRef.current?.selectionEnd ?? start;
    const token = `{{${name}}}`;
    updateContent(`${content.slice(0, start)}${token}${content.slice(end)}`);
    requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.setSelectionRange(start + token.length, start + token.length); });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing?.title?.trim() || !editing.content?.trim()) { templates.setError('模板名称和内容不能为空'); return; }
    setBusy(true); templates.setError('');
    try {
      const body = { title: editing.title.trim(), content: editing.content.trim(), category: editing.category?.trim() || null };
      if (editing.id) await patch(`/templates/${editing.id}`, body); else await post('/templates', body);
      closeEditor(); await templates.reload();
    } catch (reason) { templates.setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const generatePreview = async () => {
    if (!editing?.content?.trim()) { templates.setError('请先填写模板内容'); return; }
    setBusy(true); templates.setError('');
    try { setPreview(await post<TemplatePreview>('/templates/preview', { content: editing.content, friendRemark: '王经理', salutation: '王总' })); }
    catch (reason) { templates.setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const favorite = async (item: MessageTemplate) => { try { await post(`/templates/${item.id}/favorite`); await templates.reload(); } catch (reason) { templates.setError((reason as Error).message); } };
  const copy = async (item: MessageTemplate) => { try { await post(`/templates/${item.id}/copy`); setTab('USER'); await templates.reload(); } catch (reason) { templates.setError((reason as Error).message); } };
  const remove = async (item: MessageTemplate) => { try { await post(`/templates/${item.id}/delete`); await templates.reload(); } catch (reason) { templates.setError((reason as Error).message); } };

  return <Page>
    <PageHeader eyebrow="Content library" title="文案模板" description="创建可复用的消息骨架，插入变量后可按实际发送规则预览最终内容。" actions={<Button onClick={() => { setEditing({ title: '', content: '', category: '' }); setPreview(undefined); }}><Plus />新建模板</Button>} />
    {(templates.error || variables.error) ? <ErrorState message={templates.error || variables.error} retry={() => void Promise.all([templates.reload(), variables.reload()])} /> : null}
    <nav className="flex flex-wrap gap-2" aria-label="模板筛选">{tabs.map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={cn('rounded-full border px-4 py-2 text-xs transition-colors', tab === value ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 bg-white hover:border-neutral-500')}>{label}</button>)}</nav>
    {templates.loading && !templates.data ? <LoadingState /> : !visible?.length ? <EmptyState title="这里还没有模板" detail="新建模板，或收藏平台提供的精选内容。" /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((item) => <Card key={item.id} className="group flex min-h-72 flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4"><span className="rounded-full bg-neutral-100 px-3 py-1 font-mono text-[10px] uppercase tracking-wider">{item.scope === 'PLATFORM' ? 'SELECTED' : `MY · V${item.version}`}</span><button type="button" aria-label={item.favorite ? '取消收藏' : '收藏模板'} onClick={() => void favorite(item)} className={cn('rounded-full p-2 transition-colors', item.favorite ? 'bg-neutral-950 text-white' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-950')}><Bookmark fill={item.favorite ? 'currentColor' : 'none'} /></button></div>
      <div className="flex flex-1 flex-col p-5"><p className="text-xs text-neutral-400">{item.category || '未分类'}</p><h2 className="mt-2 text-lg font-semibold">{item.title}</h2><p className="mt-4 line-clamp-5 whitespace-pre-wrap text-sm leading-7 text-neutral-600">{item.content}</p><div className="mt-auto flex flex-wrap gap-2 pt-5"><Button className="flex-1" onClick={() => navigate(`/tasks/new?template=${item.id}`)}><Sparkles />使用</Button>{item.scope === 'USER' ? <><Button variant="outline" onClick={() => { setEditing(item); setPreview(undefined); }}>编辑</Button><DeleteConfirm title={`删除“${item.title}”？`} description="该模板会永久删除，已创建任务中的冻结文案不会受影响。" onConfirm={() => remove(item)} trigger={<Button variant="ghost" className="text-red-600 hover:bg-red-50"><Trash2 />删除</Button>} /></> : <Button variant="outline" onClick={() => void copy(item)}><Copy />复制</Button>}</div></div>
    </Card>)}</section>}
    <Dialog open={Boolean(editing)} onClose={closeEditor} title={editing?.id ? '编辑我的模板' : '创建我的模板'} description="在光标位置插入变量，并在保存前查看一条真实渲染结果。" className="max-w-5xl">
      {editing ? <form className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]" onSubmit={save}>
        <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><FormField label="模板名称" required><Input value={editing.title ?? ''} onChange={(event) => setEditing({ ...editing, title: event.target.value })} maxLength={100} /></FormField><FormField label="分类"><Input value={editing.category ?? ''} onChange={(event) => setEditing({ ...editing, category: event.target.value })} placeholder="例如：节日问候" /></FormField></div><FormField label="模板内容" hint="点击右侧变量会插入到当前光标位置。" required><Textarea ref={editorRef} className="min-h-80" value={editing.content ?? ''} onChange={(event) => updateContent(event.target.value)} placeholder="例如：{{friend_name}}，您好……" maxLength={10000} /></FormField><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void generatePreview()}><Eye />预览实际内容</Button><Button disabled={busy}>{busy ? '处理中…' : '保存模板'}</Button></div></div>
        <aside className="space-y-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4"><VariableList title="内置变量" items={builtInVariables} onInsert={insertVariable} /><Separator /><VariableList title="我的变量" items={(variables.data ?? []).map((item) => ({ name: item.name, label: item.displayName }))} onInsert={insertVariable} empty="尚未创建自定义变量" /><Separator /><div><p className="text-sm font-semibold">实际发送预览</p><p className="mt-1 text-xs leading-5 text-neutral-500">示例联系人：王经理，称呼：王总；日期时间与外部变量由服务端实时解析。</p><div className="mt-3 min-h-40 rounded-xl border border-neutral-200 bg-white p-4">{preview ? <p className="whitespace-pre-wrap text-sm leading-7">{preview.content}</p> : <p className="text-sm text-neutral-400">点击“预览实际内容”查看结果。</p>}</div>{preview && Object.keys(preview.resolved).length ? <div className="mt-3 space-y-1 font-mono text-[11px] text-neutral-500">{Object.entries(preview.resolved).map(([name, value]) => <p key={name}>{`{{${name}}}`} = {value}</p>)}</div> : null}</div></aside>
      </form> : null}
    </Dialog>
  </Page>;
}

function VariableList({ title, items, onInsert, empty }: { title: string; items: Array<{ name: string; label: string }>; onInsert: (name: string) => void; empty?: string }) {
  return <div><p className="mb-3 text-sm font-semibold">{title}</p><div className="flex flex-wrap gap-2">{items.map((item) => <button type="button" key={item.name} onClick={() => onInsert(item.name)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-xs transition-colors hover:border-neutral-950"><b className="block font-mono text-[11px]">{`{{${item.name}}}`}</b><span className="text-neutral-400">{item.label}</span></button>)}{!items.length ? <p className="text-xs text-neutral-400">{empty}</p> : null}</div></div>;
}
