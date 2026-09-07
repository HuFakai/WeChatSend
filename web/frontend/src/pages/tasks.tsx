import { CalendarClock, ChevronRight, FilePenLine, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, post } from '@/lib/api';
import { Task, TaskDraft } from '@/types';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusBadge } from '@/components/status';

const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export function TasksPage() {
  const [items, setItems] = useState<Task[]>(); const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<TaskDraft[]>();
  const load = () => Promise.all([api<Task[]>('/tasks'), api<TaskDraft[]>('/drafts')]).then(([tasks, draftItems]) => { setItems(tasks); setDrafts(draftItems); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  return <div className="page-enter space-y-6"><header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono text-[11px] uppercase tracking-[.22em] text-neutral-400">Dispatch</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">发送任务</h1><p className="mt-2 text-sm text-neutral-500">每位好友独立生成一封邮件，服务端控制投递间隔。</p></div><Button asChild><Link to="/tasks/new"><Plus className="h-4 w-4" />创建任务</Link></Button></header>{error && <ErrorState message={error} retry={load} />}
    {!!drafts?.length && <section><div className="mb-3 flex items-center gap-2"><FilePenLine className="h-4 w-4" /><h2 className="text-sm font-semibold">任务草稿</h2><span className="font-mono text-xs text-neutral-400">{drafts.length}</span></div><div className="grid gap-3 md:grid-cols-2">{drafts.map((draft) => <div key={draft.id} className="flex items-center rounded-xl border border-neutral-300 border-dashed bg-white p-4"><Link className="min-w-0 flex-1" to={`/tasks/new?draft=${draft.id}`}><p className="truncate font-medium">{draft.title || '未命名草稿'}</p><p className="mt-1 truncate text-xs text-neutral-400">更新于 {new Date(draft.updatedAt).toLocaleString('zh-CN')}</p></Link><Button variant="ghost" size="icon" onClick={async () => { await post(`/drafts/${draft.id}/delete`); await load(); }}><Trash2 className="h-4 w-4" /></Button></div>)}</div></section>}
    {!items ? <LoadingState /> : items.length === 0 ? <EmptyState title="还没有发送任务" detail="创建第一条任务，选择好友并立即或定时投递。" action={{ label: '创建任务', onClick: () => location.assign('/tasks/new') }} /> : <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">{items.map((task) => <Link to={`/tasks/${task.id}`} key={task.id} className="grid gap-4 border-b border-neutral-100 px-5 py-5 transition-colors last:border-0 hover:bg-neutral-50 md:grid-cols-[1.6fr_.8fr_1fr_36px] md:items-center"><div className="min-w-0"><p className="truncate font-medium">{task.title}</p><p className="mt-1 truncate text-sm text-neutral-500">{task.content}</p></div><div><StatusBadge status={task.status} /></div><div className="flex items-center gap-2 text-xs text-neutral-500"><CalendarClock className="h-3.5 w-3.5" />{date(task.scheduledAt)}<span className="ml-2">{task._count?.messages ?? 0} 人</span></div><ChevronRight className="h-4 w-4 text-neutral-400" /></Link>)}</div>}
    <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-100 p-4 text-xs leading-5 text-neutral-600"><Send className="mt-0.5 h-4 w-4 shrink-0" /><p>“邮件已发送”表示发信服务器接受邮件，不等于邮箱收到、快捷指令执行或微信送达。</p></div></div>;
}
