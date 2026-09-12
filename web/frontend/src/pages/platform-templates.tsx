import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '@/components/dialog';
import { DeleteConfirm } from '@/components/delete-confirm';
import { FormField } from '@/components/form-field';
import { Page, PageHeader } from '@/components/page';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
      const body = { title: editing.title.trim(), content: editing.content.trim(), category: editing.category?.trim() || null, isActive: true };
      if (editing.id) await patch(`/admin/templates/${editing.id}`, body);
      else await post('/admin/templates', body);
      setEditing(undefined); await templates.reload();
    } catch (reason) { templates.setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (item: PlatformTemplate) => { try { await post(`/admin/templates/${item.id}/delete`); await templates.reload(); } catch (reason) { templates.setError((reason as Error).message); } };

  return <Page>
    <PageHeader eyebrow="Content governance" title="行业话术库" description="保存后的平台模板直接进入普通用户内容库，不再保留停用状态。" actions={<><Button asChild variant="outline"><Link to="/admin"><ArrowLeft />返回平台管理</Link></Button><Button onClick={() => setEditing({ title: '', content: '', category: '', isActive: true })}><Plus />新增模板</Button></>} />
    {templates.error ? <ErrorState message={templates.error} retry={templates.reload} /> : null}
    {templates.loading && !templates.data ? <LoadingState /> : !templates.data?.length ? <EmptyState title="还没有平台模板" detail="创建并发布第一条行业话术。" /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.data.map((item) => <Card key={item.id} className="flex flex-col p-5"><div><span className="rounded bg-neutral-100 px-2 py-1 text-[10px] text-neutral-600">{item.category || '未分类'}</span><h2 className="mt-3 font-semibold">{item.title}</h2></div><p className="mt-4 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-neutral-600">{item.content}</p><div className="mt-auto flex gap-2 pt-5"><Button className="flex-1" variant="outline" onClick={() => setEditing(item)}>编辑</Button><DeleteConfirm title={`删除“${item.title}”？`} description="平台模板会永久删除，用户已复制的个人模板和历史任务不受影响。" onConfirm={() => remove(item)} trigger={<Button variant="ghost" className="text-red-600 hover:bg-red-50"><Trash2 />删除</Button>} /></div></Card>)}</section>}
    <Dialog open={Boolean(editing)} onClose={() => setEditing(undefined)} title={editing?.id ? '编辑平台模板' : '新增平台模板'} description="平台模板保存后会进入所有用户的内容库，请确认内容和变量格式。" className="max-w-2xl">{editing ? <form className="space-y-4" onSubmit={save}><div className="grid gap-3 sm:grid-cols-2"><FormField label="标题" required><Input value={editing.title ?? ''} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></FormField><FormField label="行业分类"><Input value={editing.category ?? ''} onChange={(event) => setEditing({ ...editing, category: event.target.value })} placeholder="例如：零售门店" /></FormField></div><FormField label="模板正文" required><Textarea className="min-h-56" value={editing.content ?? ''} onChange={(event) => setEditing({ ...editing, content: event.target.value })} placeholder="可使用 {{friend_name}}、{{date}} 等变量" /></FormField><Button className="w-full" disabled={busy}>{busy ? '保存中…' : '保存并发布'}</Button></form> : null}</Dialog>
  </Page>;
}
