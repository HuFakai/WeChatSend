import { Bookmark, Copy, Plus, Sparkles } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '@/components/dialog';
import { FormField } from '@/components/form-field';
import { Page, PageHeader } from '@/components/page';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useResource } from '@/hooks/use-resource';
import { api, patch, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { MessageTemplate } from '@/types';

type TemplateTab = 'ALL' | 'PLATFORM' | 'USER' | 'FAVORITE';
const tabs: ReadonlyArray<[TemplateTab, string]> = [['ALL', '全部'], ['PLATFORM', '平台精选'], ['USER', '我的模板'], ['FAVORITE', '已收藏']];

export function TemplatesPage() {
  const navigate = useNavigate();
  const templates = useResource(() => api<MessageTemplate[]>('/templates'), []);
  const [tab, setTab] = useState<TemplateTab>('ALL');
  const [editing, setEditing] = useState<Partial<MessageTemplate>>();
  const [busy, setBusy] = useState(false);
  const visible = useMemo(() => templates.data?.filter((item) => tab === 'ALL' || (tab === 'FAVORITE' ? item.favorite : item.scope === tab)), [templates.data, tab]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing?.title?.trim() || !editing.content?.trim()) { templates.setError('模板名称和内容不能为空'); return; }
    setBusy(true); templates.setError('');
    try {
      const body = { title: editing.title.trim(), content: editing.content.trim(), category: editing.category?.trim() || null };
      if (editing.id) await patch(`/templates/${editing.id}`, body);
      else await post('/templates', body);
      setEditing(undefined);
      await templates.reload();
    } catch (reason) { templates.setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const favorite = async (item: MessageTemplate) => { try { await post(`/templates/${item.id}/favorite`); await templates.reload(); } catch (reason) { templates.setError((reason as Error).message); } };
  const copy = async (item: MessageTemplate) => { try { await post(`/templates/${item.id}/copy`); setTab('USER'); await templates.reload(); } catch (reason) { templates.setError((reason as Error).message); } };

  return <Page>
    <PageHeader eyebrow="Content library" title="文案模板" description="精选内容与个人模板集中管理；任务提交时会冻结本次使用的模板版本。" actions={<Button onClick={() => setEditing({ title: '', content: '', category: '' })}><Plus className="h-4 w-4" />新建模板</Button>} />
    {templates.error ? <ErrorState message={templates.error} retry={templates.reload} /> : null}
    <nav className="flex flex-wrap gap-2" aria-label="模板筛选">{tabs.map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={cn('rounded-full border px-4 py-2 text-xs transition-colors', tab === value ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 bg-white hover:border-neutral-500')}>{label}</button>)}</nav>
    {templates.loading && !templates.data ? <LoadingState /> : !visible?.length ? <EmptyState title="这里还没有模板" detail="新建模板，或收藏平台提供的精选内容。" /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((item) => <Card key={item.id} className="group flex min-h-72 flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4"><span className="rounded-full bg-neutral-100 px-3 py-1 font-mono text-[10px] uppercase tracking-wider">{item.scope === 'PLATFORM' ? 'SELECTED' : `MY · V${item.version}`}</span><button type="button" aria-label={item.favorite ? '取消收藏' : '收藏模板'} onClick={() => void favorite(item)} className={cn('rounded-full p-2 transition-colors', item.favorite ? 'bg-neutral-950 text-white' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-950')}><Bookmark className="h-4 w-4" fill={item.favorite ? 'currentColor' : 'none'} /></button></div>
      <div className="flex flex-1 flex-col p-5"><p className="text-xs text-neutral-400">{item.category || '未分类'}</p><h2 className="mt-2 text-lg font-semibold">{item.title}</h2><p className="mt-4 line-clamp-5 whitespace-pre-wrap text-sm leading-7 text-neutral-600">{item.content}</p><div className="mt-auto flex gap-2 pt-5"><Button className="flex-1" onClick={() => navigate(`/tasks/new?template=${item.id}`)}><Sparkles className="h-4 w-4" />使用</Button>{item.scope === 'USER' ? <Button variant="outline" onClick={() => setEditing(item)}>编辑</Button> : <Button variant="outline" onClick={() => void copy(item)}><Copy className="h-4 w-4" />复制</Button>}</div></div>
    </Card>)}</section>}
    <Dialog open={Boolean(editing)} onClose={() => setEditing(undefined)} title={editing?.id ? '编辑我的模板' : '创建我的模板'} description="变量使用双花括号，例如 {{friend_name}}。" className="max-w-2xl">
      {editing ? <form className="space-y-4" onSubmit={save}>
        <FormField label="模板名称" required><Input value={editing.title ?? ''} onChange={(event) => setEditing({ ...editing, title: event.target.value })} maxLength={100} /></FormField>
        <FormField label="分类"><Input value={editing.category ?? ''} onChange={(event) => setEditing({ ...editing, category: event.target.value })} placeholder="例如：节日问候" /></FormField>
        <FormField label="模板内容" required><textarea className="textarea min-h-52" value={editing.content ?? ''} onChange={(event) => setEditing({ ...editing, content: event.target.value })} placeholder="可插入 {{friend_name}}、{{date}} 等变量" /></FormField>
        <Button className="w-full" disabled={busy}>{busy ? '保存中…' : '保存模板'}</Button>
      </form> : null}
    </Dialog>
  </Page>;
}
