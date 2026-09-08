import { CreditCard, Plus, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/states';
import { api, patch, post } from '@/lib/api';

type VirtualConfig = {
  appId: string; offerId: string; pushToken: string; hasAppKey: boolean; hasEncodingAesKey: boolean;
  messageMode: 'PLAINTEXT' | 'COMPATIBLE' | 'SECURE'; dataFormat: 'XML' | 'JSON'; notifyUrl: string | null; enabled: boolean;
};
type Plan = { id: string; code: string; name: string; productId: string; description: string; priceFen: number; membershipDays: number; messageQuota: number; sortOrder: number; isActive: boolean };

const emptyPlan = { code: '', name: '', productId: '', description: '', priceFen: '990', membershipDays: '30', messageQuota: '100', sortOrder: '0', isActive: true };

export function PaymentAdminPage() {
  const [config, setConfig] = useState<VirtualConfig | null>();
  const [plans, setPlans] = useState<Plan[]>();
  const [form, setForm] = useState({ appId: '', offerId: '', appKey: '', pushToken: '', encodingAesKey: '', messageMode: 'PLAINTEXT', dataFormat: 'XML', notifyUrl: '', enabled: false });
  const [plan, setPlan] = useState(emptyPlan);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [configData, planData] = await Promise.all([api<VirtualConfig | null>('/admin/virtual-payment/config'), api<Plan[]>('/admin/virtual-payment/plans')]);
      setConfig(configData);
      setPlans(planData);
      if (configData) setForm({ appId: configData.appId, offerId: configData.offerId, appKey: '', pushToken: configData.pushToken, encodingAesKey: '', messageMode: configData.messageMode, dataFormat: configData.dataFormat, notifyUrl: configData.notifyUrl || '', enabled: configData.enabled });
    } catch (reason) { setError((reason as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  const saveConfig = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await patch('/admin/virtual-payment/config', {
        appId: form.appId.trim(), offerId: form.offerId.trim(), ...(form.appKey.trim() ? { appKey: form.appKey.trim() } : {}), pushToken: form.pushToken.trim(),
        encodingAesKey: form.encodingAesKey.trim() || null, messageMode: form.messageMode, dataFormat: form.dataFormat, notifyUrl: form.notifyUrl.trim() || null, enabled: form.enabled,
      });
      setForm((current) => ({ ...current, appKey: '', encodingAesKey: '' })); setNotice('小程序虚拟支付配置已保存'); await load();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };

  const createPlan = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await post('/admin/virtual-payment/plans', { ...plan, priceFen: Number(plan.priceFen), membershipDays: Number(plan.membershipDays), messageQuota: Number(plan.messageQuota), sortOrder: Number(plan.sortOrder) });
      setPlan(emptyPlan); setNotice('套餐已创建'); await load();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };

  const togglePlan = async (item: Plan) => {
    setBusy(true); setError('');
    try { await patch(`/admin/virtual-payment/plans/${item.id}`, { isActive: !item.isActive }); await load(); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };

  if (!config && !plans) return error ? <ErrorState message={error} retry={load} /> : <LoadingState />;
  return <div className="page-enter space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[11px] uppercase tracking-[.22em] text-neutral-400">Payment Console</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">支付与套餐</h1><p className="mt-2 text-sm text-neutral-500">小程序使用微信虚拟支付；网页端使用支付宝订单码支付。明文密钥只在提交时传输，服务端加密保存。</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link to="/admin"><CreditCard className="h-4 w-4" />返回平台配置</Link></Button><Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />刷新</Button></div></header>
    {error && <ErrorState message={error} />}{notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />小程序虚拟支付配置</CardTitle></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2" onSubmit={saveConfig}><Input label="小程序 AppID" value={form.appId} onChange={(value) => setForm({ ...form, appId: value })} /><Input label="OfferID" value={form.offerId} onChange={(value) => setForm({ ...form, offerId: value })} /><Input label={`现网 AppKey${config?.hasAppKey ? '（已配置，留空表示不修改）' : ''}`} value={form.appKey} onChange={(value) => setForm({ ...form, appKey: value })} type="password" required={!config?.hasAppKey} /><Input label="消息推送 Token" value={form.pushToken} onChange={(value) => setForm({ ...form, pushToken: value })} /><Input label="EncodingAESKey（兼容/安全模式）" value={form.encodingAesKey} onChange={(value) => setForm({ ...form, encodingAesKey: value })} required={false} /><Input label="推送 URL（可选，用于记录配置）" value={form.notifyUrl} onChange={(value) => setForm({ ...form, notifyUrl: value })} placeholder="https://你的域名/api/v1/virtual-payment/notify" required={false} /><label><span className="field-label">消息模式</span><select className="select" value={form.messageMode} onChange={(event) => setForm({ ...form, messageMode: event.target.value })}><option value="PLAINTEXT">明文</option><option value="COMPATIBLE">兼容</option><option value="SECURE">安全</option></select></label><label><span className="field-label">数据格式</span><select className="select" value={form.dataFormat} onChange={(event) => setForm({ ...form, dataFormat: event.target.value })}><option value="XML">XML</option><option value="JSON">JSON</option></select></label><label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />启用小程序虚拟支付</label><div className="md:col-span-2"><Button disabled={busy}><Save className="h-4 w-4" />保存配置</Button><p className="mt-2 text-xs text-neutral-500">推送地址应在微信后台配置为：你的域名 + <code>/api/v1/virtual-payment/notify</code>。正式环境请确认已完成个人主体、工具类目、认证备案和平台审核。</p></div></form></CardContent></Card>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]"><Card><CardHeader><CardTitle>新增会员套餐</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={createPlan}><Input label="套餐编码" value={plan.code} onChange={(value) => setPlan({ ...plan, code: value })} placeholder="monthly" /><Input label="套餐名称" value={plan.name} onChange={(value) => setPlan({ ...plan, name: value })} placeholder="月度专业版" /><Input label="微信道具 ProductID" value={plan.productId} onChange={(value) => setPlan({ ...plan, productId: value })} /><Input label="价格（分）" value={plan.priceFen} onChange={(value) => setPlan({ ...plan, priceFen: value })} type="number" /><div className="grid gap-3 sm:grid-cols-3"><Input label="有效期（天）" value={plan.membershipDays} onChange={(value) => setPlan({ ...plan, membershipDays: value })} type="number" /><Input label="消息额度" value={plan.messageQuota} onChange={(value) => setPlan({ ...plan, messageQuota: value })} type="number" /><Input label="排序" value={plan.sortOrder} onChange={(value) => setPlan({ ...plan, sortOrder: value })} type="number" /></div><label><span className="field-label">说明</span><textarea className="textarea min-h-24" value={plan.description} onChange={(event) => setPlan({ ...plan, description: event.target.value })} /></label><Button className="w-full" disabled={busy}><Plus className="h-4 w-4" />创建套餐</Button></form></CardContent></Card><Card><CardHeader><CardTitle>已配置套餐</CardTitle></CardHeader><CardContent><div className="space-y-3">{plans?.map((item) => <div key={item.id} className="rounded-lg border border-neutral-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><b>{item.name}</b><span className="rounded bg-neutral-100 px-2 py-1 font-mono text-[10px]">{item.code}</span></div><p className="mt-1 text-sm text-neutral-500">{item.description}</p><p className="mt-2 text-xs text-neutral-500">¥{(item.priceFen / 100).toFixed(2)} · {item.membershipDays} 天 · {item.messageQuota || '不限'} 条额度 · ProductID {item.productId}</p></div><Button size="sm" variant={item.isActive ? 'outline' : 'default'} onClick={() => void togglePlan(item)} disabled={busy}>{item.isActive ? '下架' : '上架'}</Button></div></div>)}{!plans?.length && <p className="text-sm text-neutral-500">还没有套餐，请先创建。</p>}</div></CardContent></Card></div>
  </div>;
}

function Input({ label, value, onChange, placeholder, type = 'text', required = true }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return <label className="block"><span className="field-label">{label}</span><input className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>;
}
