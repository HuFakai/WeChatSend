import { ArrowLeft, Ban, Clock3, MailCheck, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/states';
import { StatusBadge } from '@/components/status';
import { api, post } from '@/lib/api';
import { Task, TaskMessage } from '@/types';

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

export function TaskDetailPage() {
  const { id } = useParams();
  const [task, setTask] = useState<Task>();
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const load = () => api<Task>(`/tasks/${id}`).then(setTask).catch((reason) => setError(reason.message));

  useEffect(() => {
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [id]);

  const cancel = async () => {
    if (!confirm('取消所有尚未投递的邮件？已发送邮件无法撤回。')) return;
    await post(`/tasks/${id}/cancel`);
    await load();
  };

  const resend = async (message: TaskMessage) => {
    if (!confirm(`重新向“${message.friendRemark}”发送？\n\n当前结果无法完全确认，重新发送可能造成重复。请先在微信中核对。`)) return;
    try {
      const retried = await post<Task>(`/tasks/${id}/messages/${message.id}/resend`, {
        idempotencyKey: crypto.randomUUID(),
      });
      navigate(`/tasks/${retried.id}`);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  if (error) return <ErrorState message={error} retry={load} />;
  if (!task) return <LoadingState />;

  const messages = task.messages ?? [];
  const accepted = messages.filter((message) => message.status === 'ACCEPTED').length;
  const feedbackSuccess = messages.filter((message) => message.feedbackStatus === 'SUCCESS').length;

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/tasks"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{task.title}</h1>
            <StatusBadge status={task.status} />
          </div>
          <p className="mt-2 font-mono text-xs text-neutral-400">{task.id}</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" />刷新</Button>
        {['SCHEDULED', 'RUNNING'].includes(task.status) && (
          <Button variant="destructive" onClick={cancel}><Ban className="h-4 w-4" />取消剩余</Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-xs text-neutral-500">总计</p><p className="mt-3 font-mono text-3xl">{messages.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-neutral-500">邮件已发送</p><p className="mt-3 font-mono text-3xl">{accepted}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-neutral-500">微信反馈成功</p><p className="mt-3 font-mono text-3xl">{feedbackSuccess}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-neutral-500">计划开始</p><p className="mt-3 text-sm font-medium">{formatTime(task.scheduledAt)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>消息正文</CardTitle></CardHeader>
        <CardContent><p className="whitespace-pre-wrap rounded-lg bg-neutral-100 p-4 text-sm leading-7">{task.content}</p></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>逐条邮件记录</CardTitle>
          <p className="text-xs text-neutral-500">邮件投递结果与微信快捷指令反馈分别记录。</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-neutral-100">
            {messages.map((message) => {
              const latestAttempt = message.attempts.at(-1);
              return (
                <div key={message.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(180px,1fr)_minmax(360px,1.5fr)_auto] lg:items-center">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <MailCheck className="h-4 w-4 text-neutral-400" />
                      {message.friendRemark}
                    </p>
                    <p className="mt-1 break-all font-mono text-[11px] text-neutral-400">{message.messageId}</p>
                    {(message.errorMessage || message.feedbackError) && (
                      <p className="mt-2 text-xs text-red-600">{message.feedbackError || message.errorMessage}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs">
                    <p><span className="block text-neutral-400">计划入队</span><span className="mt-1 block">{formatTime(message.readyAt)}</span></p>
                    <p><span className="block text-neutral-400">开始发信</span><span className="mt-1 block">{formatTime(latestAttempt?.startedAt)}</span></p>
                    <p><span className="block text-neutral-400">邮件发送时间</span><span className="mt-1 block">{formatTime(message.acceptedAt)}</span></p>
                    <p><span className="block text-neutral-400">反馈结果时间</span><span className="mt-1 block">{formatTime(message.feedbackReceivedAt)}</span></p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <StatusBadge status={message.status} />
                    <StatusBadge status={message.feedbackStatus ? `FEEDBACK_${message.feedbackStatus}` : 'FEEDBACK_PENDING'} />
                    {['FAILED', 'UNKNOWN'].includes(message.status) && (
                      <Button variant="outline" size="sm" onClick={() => resend(message)}>人工重发</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-neutral-400">
        <Clock3 className="h-3.5 w-3.5" />
        同一微信账号的下一封邮件，会在上一封 SMTP 尝试结束后按任务间隔继续。
      </p>
    </div>
  );
}
