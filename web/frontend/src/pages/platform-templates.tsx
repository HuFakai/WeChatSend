import { ArrowLeft, Check, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '@/components/dialog';
import { FormField } from '@/components/form-field';
import { Page, PageHeader } from '@/components/page';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useResource } from '@/hooks/use-resource';
import { api, patch, post } from '@/lib/api';
import type { PlatformTemplate } from '@/types';

type Editing = Partial<PlatformTemplate>;

export function PlatformTemplatesPage() {
  const templates = useResource(() => api<PlatformTemplate[]>('/admin/templates'), []);
  const [editing, setEditing] = useState<Editing>();
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing?.title?.trim() || !editing.content?.trim()) { templates.setError('标题和内容不能为空'); return; }
    setBusy(true); templates.setError('');
    try {
      const body = { title: editing.title.trim(), content: editing.content.trim(), category: editing.category?.trim() || null, isActive: editing.isActive ?? true };
      if (editing.id) await patch(`/admin/templates/${editing.id}`, body);
      else await post('/admin/templates', body);
      setEditing(undefined); await templates.reload();
    } catch (reason) { templates.setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const toggle = async (item: PlatformTemplate) => { try { await patch(`/admin/templates/${item.id}`, { isActive: !item.isActive }); await templates.reload(); } catch (reason) { templates.setError((reason as Error).message); } };

  return <Page>
    <PageHeader eyebrow="Content governance" title="行业话术库" description="只有启用并审核后的平台模板会对普通用户可见。" actions={<><Button asChild variant="outline"><Link to="/admin"><ArrowLeft className="h-4 w-4" />返回平台配置</Link></Button><Button onClick={() => setEditing({ title: '', content: '', category: '', isActive: true })}><Plus className="h-4 w-4" />新增模板</Button></>} />
    {templates.error ? <ErrorState message={templates.error} retry={templates.reload} /> : null}
    {templates.loading && !templates.data ? <LoadingState /> : !templates.data?.length ? <EmptyState title="还没有平台模板" detail="创建并发布第一条行业话术。" /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.data.map((item) => <Card key={item.id} className="flex flex-col p-5"><div className="flex items-start justify-between gap-3"><div><span className="rounded bg-neutral-100 px-2 py-1 text-[10px] text-neutral-600">{item.category || '未分类'}</span><h2 className="mt-3 font-semibold">{item.title}</h2></div>{item.isActive ? <span className="flex items-center gap-1 text-xs text-neutral-500"><Check className="h-4 w-4" />已发布</span> : null}</div><p className="mt-4 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-neutral-600">{item.content}</p><div className="mt-auto flex gap-2 pt-5"><Button className="flex-1" variant="outline" onClick={() => setEditing(item)}>编辑</Button><Button variant={item.isActive ? 'ghost' : 'default'} onClick={() => void toggle(item)}>{item.isActive ? '停用' : '发布'}</Button></div></Card>)}</section>}
    <Dialog open={Boolean(editing)} onClose={() => setEditing(undefined)} title={editing?.id ? '编辑平台模板' : '新增平台模板'} description="平台模板会进入所有用户的内容库，请确认内容和变量格式。" className="max-w-2xl">{editing ? <form className="space-y-4" onSubmit={save}><div className="grid gap-3 sm:grid-cols-2"><FormField label="标题" required><Input value={editing.title ?? ''} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></FormField><FormField label="行业分类"><Input value={editing.category ?? ''} onChange={(event) => setEditing({ ...editing, category: event.target.value })} placeholder="例如：零售门店" /></FormField></div><FormField label="模板正文" required><textarea className="textarea min-h-56" value={editing.content ?? ''} onChange={(event) => setEditing({ ...editing, content: event.target.value })} placeholder="可使用 {{friend_name}}、{{date}} 等变量" /></FormField><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isActive ?? true} onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })} />保存后对普通用户可见</label><Button className="w-full" disabled={busy}>{busy ? '保存中…' : '保存模板'}</Button></form> : null}</Dialog>
  </Page>;
}
