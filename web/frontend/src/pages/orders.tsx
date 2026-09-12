import { CreditCard, RefreshCw, Search } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Definition, Page, PageHeader } from '@/components/page';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, post } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const labels: Record<string, string> = { PENDING: '待支付 / 待核实', PAID: '已支付', DELIVERED: '权益已发放', CLOSED: '已关闭', FAILED: '下单失败', REFUNDED: '已退款' };
type Order = { id: string; channel: string; outTradeNo: string; subject: string; amountFen: number; status: string; createdAt: string; paidAt?: string; notifyAt?: string; deliveredAt?: string; queriedAt?: string; tradeNo?: string; failureReason?: string; user?: { username: string; email?: string } };
type Result = { items: Order[]; total: number };

export function OrdersPage({ admin = false }: { admin?: boolean }) {
  const navigate = useNavigate();
  const [channel, setChannel] = useState('ALIPAY');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Result>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const base = admin ? '/admin/orders' : '/orders';

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ channel, page: String(page), ...(status ? { status } : {}), ...(search ? { search } : {}) });
      setData(await api<Result>(`${base}?${query}`));
      setError('');
    } catch (reason) { setError((reason as Error).message); }
  }, [base, channel, page, search, status]);

  useEffect(() => { setData(undefined); void load(); }, [load]);

  const submitSearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); };
  const refresh = async (order: Order) => {
    setBusy(order.id);
    try { await post(`${base}/${order.channel}/${order.id}/query`); await load(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(''); }
  };

  return <Page>
    <PageHeader eyebrow="Transaction ledger" title={admin ? '全部交易订单' : '我的订单'} description="订单以支付平台的服务端确认结果为准。网络中断或状态不确定时请先查单，不要重复付款。" actions={<Button asChild variant="outline"><Link to={admin ? '/admin/payment' : '/membership'}><CreditCard className="h-4 w-4" />{admin ? '支付配置' : '购买套餐'}</Link></Button>} />
    {error ? <ErrorState message={error} retry={load} /> : null}
    <form className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:grid-cols-[180px_180px_minmax(220px,1fr)_auto]" onSubmit={submitSearch}>
      <select aria-label="支付渠道" className="select" value={channel} onChange={(event) => { setChannel(event.target.value); setPage(1); }}><option value="ALIPAY">支付宝订单码</option><option value="WECHAT_VIRTUAL">微信虚拟支付</option></select>
      <select aria-label="订单状态" className="select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">全部状态</option>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-400" /><input className="input pl-9" aria-label="订单号" placeholder="搜索商户订单号" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div>
      <Button variant="outline">查询</Button>
    </form>
    {!data ? <LoadingState label="正在读取订单" /> : !data.items.length ? <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-14 text-center text-sm text-neutral-500">暂无符合条件的订单</div> : <Card className="divide-y divide-neutral-100 overflow-hidden">
      {data.items.map((order) => <article key={order.id} className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{order.subject}</h2><OrderStatus status={order.status} /></div><p className="mt-2 select-all font-mono text-[11px] text-neutral-500">{order.outTradeNo}</p>{order.user ? <p className="mt-1 text-xs text-neutral-500">用户：{order.user.email || order.user.username}</p> : null}</div>
          <strong className="font-mono text-xl">{formatCurrency(order.amountFen)}</strong>
        </div>
        <dl className="my-5 grid gap-4 rounded-xl bg-neutral-50 p-4 sm:grid-cols-2 xl:grid-cols-4"><Definition label="创建时间">{formatDateTime(order.createdAt)}</Definition><Definition label="支付确认">{formatDateTime(order.paidAt)}</Definition><Definition label="通知 / 发货">{formatDateTime(order.notifyAt || order.deliveredAt)}</Definition><Definition label="最近查单">{formatDateTime(order.queriedAt)}</Definition></dl>
        {order.tradeNo ? <p className="mb-3 font-mono text-xs text-neutral-500">平台交易号：{order.tradeNo}</p> : null}
        {order.failureReason ? <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{order.failureReason}</p> : null}
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void refresh(order)}><RefreshCw className={cn('h-3.5 w-3.5', busy === order.id && 'animate-spin')} />{busy === order.id ? '查询中' : '向支付平台查单'}</Button>{!admin && order.status === 'PENDING' && order.channel === 'ALIPAY' ? <Button size="sm" onClick={() => navigate(`/membership?orderId=${order.id}`)}>继续支付</Button> : null}</div>
      </article>)}
    </Card>}
    <div className="flex items-center justify-between text-sm text-neutral-500"><span>共 {data?.total || 0} 条 · 第 {page} 页</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><Button variant="outline" disabled={!data || page * 20 >= data.total} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div>
  </Page>;
}

function OrderStatus({ status }: { status: string }) {
  const failed = ['FAILED', 'CLOSED', 'REFUNDED'].includes(status);
  const success = ['PAID', 'DELIVERED'].includes(status);
  return <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-medium', failed ? 'border-red-200 bg-red-50 text-red-700' : success ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-neutral-300 bg-neutral-100 text-neutral-600')}>{labels[status] || status}</span>;
}
