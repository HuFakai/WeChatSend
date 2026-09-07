import { ArrowRight, BookUser, CircleCheck, CircleDashed, Plus, Radio, Send, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/states';

type Summary = { accounts: number; friends: number; tasks: number; messages: Record<string, number> };

export function DashboardPage() {
  const [data, setData] = useState<Summary>(); const [error, setError] = useState('');
  const load = () => { setError(''); api<Summary>('/tasks/summary').then(setData).catch((e) => setError(e.message)); };
  useEffect(load, []);
  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <LoadingState />;
  const delivered = data.messages.ACCEPTED ?? 0; const pending = (data.messages.PENDING ?? 0) + (data.messages.SENDING ?? 0);
  return <div className="page-enter space-y-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono text-[11px] uppercase tracking-[.22em] text-neutral-400">Overview</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">工作台</h1><p className="mt-2 text-sm text-neutral-500">清楚掌握账号、好友与邮件投递进度。</p></div><Button asChild><Link to="/tasks/new"><Plus className="h-4 w-4" />创建发送任务</Link></Button></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{([
      ['发送账号', data.accounts, Radio], ['好友备注', data.friends, BookUser], ['全部任务', data.tasks, Send], ['邮件已发送', delivered, CircleCheck],
    ] as [string, number, LucideIcon][]).map(([label, value, Icon]) => <Card key={label}><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-neutral-500">{label}</span><Icon className="h-4 w-4 text-neutral-400" /></div><p className="mt-6 font-mono text-3xl font-medium tracking-[-.04em]">{value}</p></CardContent></Card>)}</div>
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]"><Card><CardHeader><CardTitle>开始一次发送</CardTitle></CardHeader><CardContent><div className="grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-3">{[
      ['01', '配置账号', '填写 iPhone 接收邮件的地址', '/accounts'], ['02', '维护好友', '以唯一微信备注添加好友', '/friends'], ['03', '创建任务', '确认文案、对象和发送时间', '/tasks/new'],
    ].map(([n,t,d,to]) => <Link key={n} to={to} className="group bg-white p-5 transition-colors hover:bg-neutral-50"><span className="font-mono text-xs text-neutral-400">{n}</span><p className="mt-8 font-semibold">{t}</p><p className="mt-1 text-xs leading-5 text-neutral-500">{d}</p><ArrowRight className="mt-5 h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>)}</div></CardContent></Card>
      <Card className="bg-neutral-950 text-white"><CardHeader><CardTitle>队列状态</CardTitle></CardHeader><CardContent><div className="flex items-end justify-between"><div><p className="font-mono text-5xl tracking-[-.05em]">{pending}</p><p className="mt-2 text-sm text-neutral-400">正在等待或发送</p></div><CircleDashed className="h-9 w-9 text-neutral-600" /></div><div className="mt-8 border-t border-neutral-800 pt-4 text-xs leading-5 text-neutral-500">邮件已发送仅表示 SMTP 服务接受，不代表微信已送达。</div></CardContent></Card></div>
  </div>;
}
