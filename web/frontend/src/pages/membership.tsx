import { Check, CreditCard, QrCode, ReceiptText, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, PageHeader, SectionHeading } from '@/components/page';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, post } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/format';

type Plan = { id: string; code: string; name: string; description: string; priceFen: number; membershipDays: number; messageQuota: number };
type Order = { id: string; outTradeNo: string; subject: string; amountFen: number; status: 'PENDING' | 'PAID' | 'CLOSED' | 'FAILED' | 'REFUNDED'; qrDataUrl?: string; expiresAt: string; failureReason?: string };
type Grant = { id: string; expiresAt: string; quotaTotal: number; quotaUsed: number; plan: { name: string; description: string } };

export function MembershipPage() {
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [order, setOrder] = useState<Order>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [planData, grantData] = await Promise.all([api<Plan[]>('/alipay/plans'), api<Grant[]>('/virtual-payment/entitlements')]);
      setPlans(planData); setGrants(grantData); setError('');
    } catch (reason) { setError((reason as Error).message); }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { const id = params.get('orderId'); if (id) void api<Order>(`/alipay/orders/${id}`).then(setOrder).catch((reason) => setError(reason.message)); }, [params]);
  useEffect(() => { if (order?.status === 'PAID') void load(); }, [order?.status]);
  useEffect(() => {
    if (!order || order.status !== 'PENDING') return;
    const timer = window.setInterval(() => { void post<Order>(`/alipay/orders/${order.id}/query`).then((next) => setOrder((current) => current ? { ...current, ...next } : next)).catch(() => undefined); }, 4000);
    return () => window.clearInterval(timer);
  }, [order?.id, order?.status]);

  const buy = async (planId: string) => {
    setBusy(true); setError('');
    try { const next = await post<Order>('/alipay/orders', { planId }); setOrder(next); setParams({ orderId: next.id }); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  if (!plans) return error ? <ErrorState message={error} retry={load} /> : <LoadingState />;
  return <Page>
    <PageHeader eyebrow="Plans & entitlement" title="会员套餐" description="网页端使用支付宝订单码支付。只有服务端确认收款后才会发放会员权益。" actions={<Button asChild variant="outline"><Link to="/orders"><ReceiptText className="h-4 w-4" />订单记录</Link></Button>} />
    {error ? <ErrorState message={error} /> : null}
    <section>
      <SectionHeading title="选择套餐" description="小程序购买同类权益时使用微信虚拟支付" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.map((plan, index) => <Card key={plan.id} className={index === 0 ? 'border-neutral-950' : ''}>
        <div className="flex items-start justify-between border-b border-neutral-100 p-5"><div><p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">{plan.membershipDays} days</p><h2 className="mt-2 text-xl font-semibold">{plan.name}</h2></div><CreditCard className="h-5 w-5 text-neutral-400" /></div>
        <div className="p-5"><p className="min-h-12 text-sm leading-6 text-neutral-500">{plan.description}</p><p className="mt-6 font-mono text-3xl tracking-[-.06em]">{formatCurrency(plan.priceFen)}</p><p className="mt-2 text-xs text-neutral-500">{plan.messageQuota ? `${plan.messageQuota} 条消息额度` : '不限消息额度'}</p><Button className="mt-5 w-full" disabled={busy || order?.status === 'PENDING'} onClick={() => void buy(plan.id)}>支付宝扫码购买</Button></div>
      </Card>)}</div>
    </section>
    {order ? <Card className="overflow-hidden border-neutral-950">
      <div className="border-b border-neutral-200 bg-neutral-950 px-5 py-4 text-white"><h2 className="flex items-center gap-2 text-sm font-semibold"><QrCode className="h-4 w-4" />支付宝订单码</h2></div>
      <div className="grid gap-7 p-6 md:grid-cols-[220px_1fr] md:items-center">
        <div className="flex justify-center">{order.qrDataUrl ? <img src={order.qrDataUrl} alt="支付宝订单码" className="h-52 w-52 rounded-xl border border-neutral-200 p-2" /> : <div className="flex h-52 w-52 items-center justify-center rounded-xl bg-neutral-100 p-5 text-center text-sm text-neutral-500">订单暂无可用支付码，请先查单</div>}</div>
        <div><p className="text-sm text-neutral-500">{order.subject}</p><p className="mt-2 font-mono text-4xl tracking-[-.06em]">{formatCurrency(order.amountFen)}</p><PaymentMessage order={order} /><div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={() => void post<Order>(`/alipay/orders/${order.id}/query`).then(setOrder).catch((reason) => setError(reason.message))}>刷新支付状态</Button><Button asChild variant="ghost"><Link to="/orders">打开订单记录</Link></Button></div><p className="mt-4 font-mono text-[11px] text-neutral-400">{order.outTradeNo} · 有效期至 {formatDateTime(order.expiresAt)}</p></div>
      </div>
    </Card> : null}
    <section>
      <SectionHeading title="当前有效权益" description="支付渠道不同，不影响会员权益合并使用" />
      <Card className="p-5">{grants.length ? <div className="grid gap-3 md:grid-cols-2">{grants.map((grant) => <div key={grant.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"><div className="flex items-center justify-between"><b>{grant.plan.name}</b><ShieldCheck className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-xs text-neutral-500">有效期至 {formatDateTime(grant.expiresAt)}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-200"><div className="h-full bg-neutral-950" style={{ width: grant.quotaTotal ? `${Math.min(100, grant.quotaUsed / grant.quotaTotal * 100)}%` : '0%' }} /></div><p className="mt-2 text-xs text-neutral-500">已使用 {grant.quotaUsed} / {grant.quotaTotal || '不限'} 条</p></div>)}</div> : <div className="py-10 text-center text-sm text-neutral-500">暂时没有有效权益</div>}</Card>
    </section>
  </Page>;
}

function PaymentMessage({ order }: { order: Order }) {
  if (order.status === 'PENDING') return <p className="mt-4 text-sm text-neutral-600">等待支付，请使用支付宝扫一扫。页面会自动查询服务端结果。</p>;
  if (order.status === 'PAID') return <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><Check className="h-4 w-4" />支付成功，会员权益已发放。</p>;
  return <p className="mt-4 text-sm text-red-700">订单状态：{order.status}。{order.failureReason || '如未付款，请重新创建订单。'}</p>;
}
