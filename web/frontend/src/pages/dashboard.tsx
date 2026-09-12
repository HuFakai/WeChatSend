import { ArrowUpRight, BookUser, CircleCheck, CircleDashed, Plus, Radio, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/states';
import { Metric, Page, PageHeader, SectionHeading } from '@/components/page';
import { api } from '@/lib/api';
import { useResource } from '@/hooks/use-resource';

type Summary = { accounts: number; friends: number; tasks: number; messages: Record<string, number> };

const setupSteps = [
  { number: '01', title: '连接发送设备', detail: '配置 iPhone 自动化接收邮箱', to: '/accounts' },
  { number: '02', title: '整理客户备注', detail: '建立唯一且可识别的好友名单', to: '/friends' },
  { number: '03', title: '创建触达任务', detail: '组合文案、客户与发送时间', to: '/tasks/new' },
];

export function DashboardPage() {
  const resource = useResource(() => api<Summary>('/tasks/summary'), []);
  if (resource.loading && !resource.data) return <LoadingState />;
  if (!resource.data) return <ErrorState message={resource.error || '工作台数据加载失败'} retry={resource.reload} />;

  const data = resource.data;
  const delivered = data.messages.ACCEPTED ?? 0;
  const pending = (data.messages.PENDING ?? 0) + (data.messages.SENDING ?? 0) + (data.messages.RETRY_WAIT ?? 0);

  return <Page>
    <PageHeader eyebrow="Operations overview" title="工作台" description="从客户名单到逐条投递，所有核心状态集中在这里。" actions={<Button asChild><Link to="/tasks/new"><Plus className="h-4 w-4" />创建发送任务</Link></Button>} />
    {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}
    <section>
      <SectionHeading title="业务概览" description="当前账号下的累计数据" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="发送账号" value={data.accounts} icon={Radio} detail="已连接的 iPhone 邮箱" />
        <Metric label="好友备注" value={data.friends} icon={BookUser} detail="跨账号累计客户" />
        <Metric label="发送任务" value={data.tasks} icon={Send} detail="历史创建任务" />
        <Metric label="邮件已接受" value={delivered} icon={CircleCheck} detail="SMTP 接受，不等于微信送达" />
      </div>
    </section>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,.7fr)]">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <SectionHeading title="开始一次客户触达" description="按照稳定的三步流程完成首次发送" />
        <div className="grid gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:grid-cols-3">
          {setupSteps.map((step) => <Link key={step.number} to={step.to} className="group flex min-h-48 flex-col bg-white p-5 transition-colors hover:bg-neutral-50">
            <span className="font-mono text-[11px] text-neutral-400">{step.number}</span>
            <div className="mt-auto"><p className="font-semibold text-neutral-950">{step.title}</p><p className="mt-1 text-xs leading-5 text-neutral-500">{step.detail}</p><ArrowUpRight className="mt-4 h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
          </Link>)}
        </div>
      </section>
      <section className="flex min-h-64 flex-col rounded-2xl bg-neutral-950 p-6 text-white">
        <div className="flex items-center justify-between"><p className="text-sm font-medium">实时队列</p><CircleDashed className="h-5 w-5 text-neutral-600" /></div>
        <div className="my-auto py-8"><p className="font-mono text-6xl tracking-[-.08em]">{pending}</p><p className="mt-3 text-sm text-neutral-400">等待或正在发送</p></div>
        <Link to="/tasks" className="flex items-center justify-between border-t border-neutral-800 pt-4 text-xs text-neutral-400 transition-colors hover:text-white">查看全部任务 <ArrowUpRight className="h-4 w-4" /></Link>
      </section>
    </div>
  </Page>;
}
