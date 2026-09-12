import { CalendarClock, ChevronRight, FilePenLine, Plus, Send, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Page, PageHeader, SectionHeading } from '@/components/page';
import { StatusBadge } from '@/components/status';
import { useResource } from '@/hooks/use-resource';
import { api, post } from '@/lib/api';
import { formatShortDateTime } from '@/lib/format';
import type { Task, TaskDraft } from '@/types';

type TaskCollection = { tasks: Task[]; drafts: TaskDraft[] };

export function TasksPage() {
  const navigate = useNavigate();
  const resource = useResource<TaskCollection>(async () => {
    const [tasks, drafts] = await Promise.all([api<Task[]>('/tasks'), api<TaskDraft[]>('/drafts')]);
    return { tasks, drafts };
  }, []);

  const removeDraft = async (id: string) => {
    try { await post(`/drafts/${id}/delete`); await resource.reload(); }
    catch (reason) { resource.setError((reason as Error).message); }
  };

  return <Page>
    <PageHeader eyebrow="Dispatch center" title="发送任务" description="任务只负责定义发送对象和内容；每位好友会独立生成邮件并记录微信反馈。" actions={<Button asChild><Link to="/tasks/new"><Plus className="h-4 w-4" />创建任务</Link></Button>} />
    {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}
    {resource.data?.drafts.length ? <section>
      <SectionHeading title="待完成草稿" description="跨端保存的任务不会自动发送" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{resource.data.drafts.map((draft) => <article key={draft.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100"><FilePenLine className="h-4 w-4" /></span>
        <Link className="min-w-0 flex-1" to={`/tasks/new?draft=${draft.id}`}><p className="truncate text-sm font-medium">{draft.title || '未命名草稿'}</p><p className="mt-1 text-xs text-neutral-400">{formatShortDateTime(draft.updatedAt)} 更新</p></Link>
        <Button variant="ghost" size="icon" aria-label="删除草稿" onClick={() => void removeDraft(draft.id)}><Trash2 className="h-4 w-4" /></Button>
      </article>)}</div>
    </section> : null}
    <section>
      <SectionHeading title="任务记录" description="按创建时间倒序排列" />
      {resource.loading && !resource.data ? <LoadingState /> : !resource.data?.tasks.length ? <EmptyState title="还没有发送任务" detail="创建第一条任务，选择好友并立即或定时投递。" action={{ label: '创建任务', onClick: () => navigate('/tasks/new') }} /> : <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_150px_210px_80px_28px] gap-4 border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-400 md:grid"><span>任务内容</span><span>状态</span><span>计划时间</span><span>人数</span><span /></div>
        {resource.data.tasks.map((task) => <Link to={`/tasks/${task.id}`} key={task.id} className="grid gap-4 border-b border-neutral-100 px-5 py-5 transition-colors last:border-0 hover:bg-neutral-50 md:grid-cols-[minmax(0,1.6fr)_150px_210px_80px_28px] md:items-center">
          <div className="min-w-0"><p className="truncate font-medium text-neutral-950">{task.title}</p><p className="mt-1 truncate text-sm text-neutral-500">{task.content}</p></div>
          <StatusBadge status={task.status} />
          <div className="flex items-center gap-2 text-xs text-neutral-500"><CalendarClock className="h-3.5 w-3.5" />{formatShortDateTime(task.scheduledAt)}</div>
          <span className="font-mono text-xs text-neutral-500">{task._count?.messages ?? 0} 人</span>
          <ChevronRight className="h-4 w-4 text-neutral-400" />
        </Link>)}
      </div>}
    </section>
    <aside className="flex items-start gap-3 rounded-xl border border-neutral-300 bg-neutral-100 p-4 text-xs leading-5 text-neutral-600"><Send className="mt-0.5 h-4 w-4 shrink-0" /><p>“邮件已发送”仅表示发信服务器接受邮件；微信是否成功，以快捷指令反馈或一分钟超时结果为准。</p></aside>
  </Page>;
}
