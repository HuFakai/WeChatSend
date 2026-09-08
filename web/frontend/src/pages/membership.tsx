import { CheckCircle2, CreditCard, Loader2, QrCode, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/states';
import { api, post } from '@/lib/api';

type Plan = { id: string; code: string; name: string; description: string; priceFen: number; membershipDays: number; messageQuota: number };
type Order = { id: string; outTradeNo: string; subject: string; amountFen: number; status: 'PENDING' | 'PAID' | 'CLOSED' | 'FAILED' | 'REFUNDED'; qrDataUrl?: string; qrCode?: string | null; expiresAt: string; paidAt?: string | null };
type Grant = { id: string; expiresAt: string; quotaTotal: number; quotaUsed: number; plan: { name: string; description: string } };

export function MembershipPage() {
  const [plans, setPlans] = useState<Plan[]>();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [order, setOrder] = useState<Order>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try { const [planData, grantData] = await Promise.all([api<Plan[]>('/alipay/plans'), api<Grant[]>('/virtual-payment/entitlements')]); setPlans(planData); setGrants(grantData); }
    catch (reason) { setError((reason as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!order || order.status !== 'PENDING') return;
    const timer = window.setInterval(() => { void post<Order>(`/alipay/orders/${order.id}/query`).then((next) => setOrder((current) => ({ ...current, ...next }))).catch(() => undefined); }, 4000);
    return () => window.clearInterval(timer);
  }, [order?.id, order?.status]);

  const buy = async (planId: string) => {
    setBusy(true); setError('');
    try { setOrder(await post<Order>('/alipay/orders', { planId })); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };

  if (!plans) return error ? <ErrorState message={error} retry={load} /> : <LoadingState />;
  return <div className="page-enter space-y-6">
    <header><p className="font-mono text-[11px] uppercase tracking-[.22em] text-emerald-700">Membership</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">会员套餐</h1><p className="mt-2 max-w-2xl text-sm text-neutral-500">选择套餐后使用支付宝扫码支付。订单码有效期内页面会自动查询，支付完成后服务端才会发放权益。</p></header>
    {error && <ErrorState message={error} />}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.map((plan) => <Card key={plan.id} className="flex flex-col p-5"><div className="flex items-start justify-between gap-3"><div><span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-800">{plan.membershipDays} 天</span><h2 className="mt-3 text-lg font-semibold">{plan.name}</h2></div><CreditCard className="h-5 w-5 text-emerald-700" /></div><p className="mt-3 min-h-12 text-sm leading-6 text-neutral-500">{plan.description}</p><div className="mt-5 flex items-end justify-between gap-3"><strong className="text-2xl">¥{(plan.priceFen / 100).toFixed(2)}</strong><span className="text-xs text-neutral-500">{plan.messageQuota ? `${plan.messageQuota} 条消息额度` : '不限额度'}</span></div><Button className="mt-5 w-full" disabled={busy || Boolean(order?.status === 'PENDING')} onClick={() => void buy(plan.id)}>支付宝扫码购买</Button></Card>)}</div>
    {order && <Card className="overflow-hidden border-emerald-200"><CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-4 w-4 text-emerald-700" />支付宝订单码</CardTitle></CardHeader><CardContent><div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center"><div className="flex justify-center">{order.qrDataUrl ? <img src={order.qrDataUrl} alt="支付宝订单码" className="h-52 w-52 rounded-lg border border-emerald-100 p-2" /> : <div className="flex h-52 w-52 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Loader2 className="h-6 w-6 animate-spin" /></div>}</div><div><p className="text-sm text-neutral-500">{order.subject}</p><p className="mt-2 text-3xl font-semibold">¥{(order.amountFen / 100).toFixed(2)}</p>{order.status === 'PENDING' && <p className="mt-3 text-sm text-emerald-700">等待支付。请使用支付宝扫一扫，支付成功后页面会自动更新。</p>}{order.status === 'PAID' && <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />支付成功，会员权益已发放。</p>}{order.status !== 'PENDING' && order.status !== 'PAID' && <p className="mt-3 text-sm text-red-600">订单状态：{order.status}。如未完成支付，请重新创建订单。</p>}<p className="mt-3 font-mono text-xs text-neutral-400">订单号：{order.outTradeNo}</p></div></div></CardContent></Card>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700" />当前有效权益</CardTitle></CardHeader><CardContent>{grants.length ? <div className="grid gap-3 md:grid-cols-2">{grants.map((grant) => <div key={grant.id} className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4"><b>{grant.plan.name}</b><p className="mt-1 text-sm text-neutral-500">有效期至 {new Date(grant.expiresAt).toLocaleString('zh-CN')}</p><p className="mt-2 text-xs text-neutral-500">已使用 {grant.quotaUsed} / {grant.quotaTotal || '不限'} 条</p></div>)}</div> : <p className="text-sm text-neutral-500">暂时没有有效权益。</p>}</CardContent></Card>
  </div>;
}
