import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, FilePenLine, Layers3, Plus, Search, Send, Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Metric, Page, PageHeader } from '@/components/page';
import { StatusBadge } from '@/components/status';
import { useResource } from '@/hooks/use-resource';
import { api, post } from '@/lib/api';
import { formatShortDateTime } from '@/lib/format';
import type { Task, TaskDraft } from '@/types';

type TaskPage = { items: Task[]; total: number; page: number; pageSize: number };
type TaskCollection = { taskPage: TaskPage; drafts: TaskDraft[] };

export function TasksPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const resource = useResource<TaskCollection>(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search) query.set('search', search);
    const [taskPage, drafts] = await Promise.all([api<TaskPage>(`/tasks/page?${query}`), api<TaskDraft[]>('/drafts')]);
    return { taskPage, drafts };
  }, [page, search]);
  const pageItems = resource.data?.taskPage.items ?? [];
  const pageStats = useMemo(() => ({
    running: pageItems.filter((task) => ['SCHEDULED', 'RUNNING'].includes(task.status)).length,
    completed: pageItems.filter((task) => task.status === 'COMPLETED').length,
    recipients: pageItems.reduce((total, task) => total + (task._count?.messages ?? 0), 0),
  }), [pageItems]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };
  const clearSearch = () => { setSearchInput(''); setSearch(''); setPage(1); };
  const removeDraft = async (id: string) => {
    try { await post(`/drafts/${id}/delete`); await resource.reload(); }
    catch (reason) { resource.setError((reason as Error).message); }
  };

  return <Page>
    <PageHeader eyebrow="Dispatch center" title="发送任务" description="把一次客户触达拆成清晰、可追踪的发送批次；邮件投递与微信反馈分别记录。" actions={<Button asChild><Link to="/tasks/new"><Plus data-icon="inline-start" />创建任务</Link></Button>} />
    {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="任务概览">
      <Metric label="全部任务" value={resource.data?.taskPage.total ?? '—'} icon={Layers3} detail="历史发送批次" dark />
      <Metric label="本页进行中" value={pageStats.running} icon={CircleDashed} detail="等待定时或正在处理" />
      <Metric label="本页已完成" value={pageStats.completed} icon={CheckCircle2} detail="全部收件人已处理" />
      <Metric label="本页触达人数" value={pageStats.recipients} icon={Send} detail="逐人生成独立记录" />
    </section>

    {resource.data?.drafts.length ? <section className="flex flex-col gap-3">
      <div><h2 className="text-base font-semibold tracking-tight">待完成草稿</h2><p className="mt-1 text-xs text-neutral-500">继续编辑跨端保存、尚未进入发送队列的任务。</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{resource.data.drafts.map((draft, index) => <Card key={draft.id} className="group overflow-hidden border-dashed transition-colors hover:border-neutral-500">
        <CardContent className="flex items-center gap-4 p-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-white"><FilePenLine /></span><Link className="min-w-0 flex-1" to={`/tasks/new?draft=${draft.id}`}><p className="truncate text-sm font-semibold">{draft.title || '未命名草稿'}</p><p className="mt-1 font-mono text-[10px] text-neutral-400">DRAFT {String(index + 1).padStart(2, '0')} · {formatShortDateTime(draft.updatedAt)}</p></Link><Button variant="ghost" size="icon" aria-label={`删除草稿“${draft.title || '未命名草稿'}”`} onClick={() => void removeDraft(draft.id)}><Trash2 /></Button></CardContent>
      </Card>)}</div>
    </section> : null}

    <Card className="overflow-hidden">
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between"><div><CardTitle>任务记录</CardTitle><CardDescription>{resource.data ? `共 ${resource.data.taskPage.total} 条，按创建时间倒序排列` : '按创建时间倒序排列'}</CardDescription></div><form onSubmit={submitSearch} className="flex w-full gap-2 sm:max-w-md" role="search"><label className="relative min-w-0 flex-1"><span className="sr-only">搜索任务</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" /><input className="input pl-9" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索标题或消息内容" /></label><Button variant="outline" disabled={resource.loading}>搜索</Button>{search ? <Button type="button" variant="ghost" onClick={clearSearch}>清除</Button> : null}</form></CardHeader>
      <CardContent className="p-0">
        {resource.loading && !resource.data ? <LoadingState /> : !pageItems.length ? <EmptyState title={search ? '没有匹配的任务' : '还没有发送任务'} detail={search ? '请调整关键词后重试。' : '创建第一条任务，选择好友并立即或定时投递。'} action={search ? { label: '清除搜索', onClick: clearSearch } : { label: '创建任务', onClick: () => navigate('/tasks/new') }} /> : <div>
          <div className="hidden grid-cols-[44px_minmax(0,1.7fr)_150px_250px_90px_24px] gap-4 border-b border-neutral-200 bg-neutral-50 px-5 py-3 font-mono text-[10px] uppercase tracking-[.14em] text-neutral-400 lg:grid"><span>序号</span><span>任务内容</span><span>状态</span><span>时间记录</span><span>人数</span><span /></div>
          {pageItems.map((task, index) => <Link to={`/tasks/${task.id}`} key={task.id} className="group grid gap-4 border-b border-neutral-100 px-5 py-5 transition-colors last:border-0 hover:bg-neutral-50 lg:grid-cols-[44px_minmax(0,1.7fr)_150px_250px_90px_24px] lg:items-center">
            <span className="hidden size-8 items-center justify-center rounded-lg border border-neutral-200 font-mono text-[10px] text-neutral-400 lg:flex">{String((page - 1) * 20 + index + 1).padStart(2, '0')}</span>
            <div className="min-w-0"><p className="truncate font-semibold text-neutral-950">{task.title}</p><p className="mt-1 truncate text-sm text-neutral-500">{task.content}</p><p className="mt-2 truncate font-mono text-[9px] uppercase tracking-wider text-neutral-300">{task.id}</p></div>
            <StatusBadge status={task.status} />
            <div className="grid gap-1.5 text-xs text-neutral-500"><p className="flex items-center gap-2"><CalendarClock className="size-3.5" /><span className="text-neutral-400">计划</span><time>{formatShortDateTime(task.scheduledAt)}</time></p><p className="flex items-center gap-2 pl-[22px]"><span className="text-neutral-400">创建</span><time>{formatShortDateTime(task.createdAt)}</time></p></div>
            <span className="font-mono text-xs text-neutral-500">{task._count?.messages ?? 0} 人</span>
            <ChevronRight className="size-4 text-neutral-300 transition-transform group-hover:translate-x-1 group-hover:text-neutral-950" />
          </Link>)}
        </div>}
      </CardContent>
    </Card>
    {resource.data && resource.data.taskPage.total > resource.data.taskPage.pageSize ? <TaskPagination page={page} total={resource.data.taskPage.total} pageSize={resource.data.taskPage.pageSize} busy={resource.loading} onPage={setPage} /> : null}
    <aside className="flex items-start gap-3 rounded-xl border border-neutral-300 bg-neutral-100 p-4 text-xs leading-5 text-neutral-600"><Send className="mt-0.5 size-4 shrink-0" /><p>“邮件已发送”仅表示发信服务器接受邮件；微信是否成功，以快捷指令反馈或一分钟超时结果为准。</p></aside>
  </Page>;
}

function TaskPagination({ page, total, pageSize, busy, onPage }: { page: number; total: number; pageSize: number; busy: boolean; onPage: (page: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  return <nav className="flex items-center justify-between" aria-label="任务分页"><p className="text-xs text-neutral-500">第 {page} / {pages} 页</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft data-icon="inline-start" />上一页</Button><Button variant="outline" size="sm" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>下一页<ChevronRight data-icon="inline-end" /></Button></div></nav>;
}
