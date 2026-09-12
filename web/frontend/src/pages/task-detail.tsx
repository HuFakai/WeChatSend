import { ArrowLeft, Ban, Clock3, Copy, MailCheck, RefreshCw, Send, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Definition, Metric, Page } from '@/components/page';
import { ErrorState, LoadingState } from '@/components/states';
import { StatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Task, TaskMessage } from '@/types';
import { Dialog } from '@/components/dialog';

export function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task>();
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ kind: 'cancel' } | { kind: 'resend'; message: TaskMessage }>();

  const load = useCallback(async (quiet = false) => {
    if (!id) return;
    if (!quiet) setRefreshing(true);
    try { setTask(await api<Task>(`/tasks/${id}`)); setError(''); }
    catch (reason) { setError((reason as Error).message); }
    finally { if (!quiet) setRefreshing(false); }
  }, [id]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 5000); return () => window.clearInterval(timer); }, [load]);

  const cancel = async () => { try { await post(`/tasks/${id}/cancel`); setPendingAction(undefined); await load(); } catch (reason) { setError((reason as Error).message); } };
  const resend = async (message: TaskMessage) => {
    try { const retried = await post<Task>(`/tasks/${id}/messages/${message.id}/resend`, { idempotencyKey: crypto.randomUUID() }); setPendingAction(undefined); navigate(`/tasks/${retried.id}`); }
    catch (reason) { setError((reason as Error).message); }
  };
  const copyTask = async () => { try { const draft = await post<{ id: string }>(`/tasks/${id}/copy`); navigate(`/tasks/new?draft=${draft.id}`); } catch (reason) { setError((reason as Error).message); } };

  const metrics = useMemo(() => {
    const messages = task?.messages ?? [];
    return { total: messages.length, accepted: messages.filter((message) => message.status === 'ACCEPTED').length, feedback: messages.filter((message) => message.feedbackStatus === 'SUCCESS').length };
  }, [task?.messages]);

  if (!task && !error) return <LoadingState />;
  if (!task) return <ErrorState message={error} retry={load} />;
  const messages = task.messages ?? [];

  return <Page>
    <header className="flex flex-wrap items-start gap-3 border-b border-neutral-300 pb-6">
      <Button asChild variant="ghost" size="icon"><Link to="/tasks" aria-label="返回任务列表"><ArrowLeft className="h-4 w-4" /></Link></Button>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-[-.035em]">{task.title}</h1><StatusBadge status={task.status} /></div><p className="mt-2 break-all font-mono text-[10px] text-neutral-400">{task.id}</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={refreshing}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />刷新</Button>
      <Button variant="outline" onClick={() => void copyTask()}><Copy className="h-4 w-4" />复制任务</Button>
      {['SCHEDULED', 'RUNNING'].includes(task.status) ? <Button variant="destructive" onClick={() => setPendingAction({ kind: 'cancel' })}><Ban className="h-4 w-4" />取消剩余</Button> : null}
    </header>
    {error ? <ErrorState message={error} retry={load} /> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="发送对象" value={metrics.total} icon={Users} /><Metric label="邮件已接受" value={metrics.accepted} icon={Send} /><Metric label="微信成功反馈" value={metrics.feedback} icon={MailCheck} /><Metric label="计划开始" value={formatDateTime(task.scheduledAt)} icon={Clock3} /></div>
    <Card><CardHeader><CardTitle>消息正文</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap rounded-xl bg-neutral-100 p-4 text-sm leading-7">{task.content}</p></CardContent></Card>
    <Card>
      <CardHeader><CardTitle>逐条发送记录</CardTitle><p className="text-xs text-neutral-500">邮件投递与微信快捷指令反馈分开记录，每一行对应一位好友。</p></CardHeader>
      <CardContent className="p-0"><div className="divide-y divide-neutral-100">{messages.map((message) => <MessageRow key={message.id} message={message} onResend={(item) => setPendingAction({ kind: 'resend', message: item })} />)}</div></CardContent>
    </Card>
    <p className="flex items-center gap-2 text-xs text-neutral-400"><Clock3 className="h-3.5 w-3.5" />同一微信账号的下一封邮件，会在上一封 SMTP 尝试完成后严格按照任务间隔继续。</p>
    <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(undefined)} title={pendingAction?.kind === 'cancel' ? '取消剩余发送' : '确认人工重发'} description={pendingAction?.kind === 'cancel' ? '尚未投递的邮件会被取消，已经发送的邮件无法撤回。' : `将重新向“${pendingAction?.kind === 'resend' ? pendingAction.message.friendRemark : ''}”发送。结果无法完全确认时可能造成重复，请先在微信中核对。`} className="max-w-sm"><div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setPendingAction(undefined)}>返回</Button><Button variant="destructive" className="flex-1" onClick={() => void (pendingAction?.kind === 'cancel' ? cancel() : pendingAction ? resend(pendingAction.message) : Promise.resolve())}>{pendingAction?.kind === 'cancel' ? '确认取消' : '确认重发'}</Button></div></Dialog>
  </Page>;
}

function MessageRow({ message, onResend }: { message: TaskMessage; onResend: (message: TaskMessage) => void }) {
  const latestAttempt = message.attempts.at(-1);
  const issue = message.feedbackState === 'TIMEOUT' ? '超过 1 分钟未收到微信反馈，请确认该好友的微信备注是否正确。' : message.feedbackError || message.errorMessage;
  return <article className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(180px,.8fr)_minmax(380px,1.4fr)_auto] lg:items-center">
    <div><p className="flex items-center gap-2 font-medium"><MailCheck className="h-4 w-4 text-neutral-400" />{message.friendRemark}</p><p className="mt-1 break-all font-mono text-[10px] text-neutral-400">{message.messageId}</p>{issue ? <p className="mt-2 text-xs leading-5 text-red-700">{issue}</p> : null}</div>
    <dl className="grid grid-cols-2 gap-4 rounded-xl bg-neutral-50 p-3"><Definition label="计划入队">{formatDateTime(message.readyAt)}</Definition><Definition label="开始发信">{formatDateTime(latestAttempt?.startedAt)}</Definition><Definition label="邮件发送">{formatDateTime(message.acceptedAt)}</Definition><Definition label="反馈时间">{formatDateTime(message.feedbackReceivedAt)}</Definition></dl>
    <div className="flex flex-wrap items-center gap-2 lg:max-w-52 lg:justify-end"><StatusBadge status={message.status} /><StatusBadge status={`FEEDBACK_${message.feedbackState}`} />{['FAILED', 'UNKNOWN'].includes(message.status) ? <Button variant="outline" size="sm" onClick={() => onResend(message)}>人工重发</Button> : null}</div>
  </article>;
}
