import { AlipaySettings } from '@/components/alipay-settings';
import { CreditCard, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DeleteConfirm } from '@/components/delete-confirm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/states';
import { Page, PageHeader } from '@/components/page';
import { useToast } from '@/components/toast';
import { api, patch, post } from '@/lib/api';

type VirtualConfig = {
  appId: string; offerId: string; hasPushToken: boolean; hasAppKey: boolean; appKeyUsable: boolean; hasEncodingAesKey: boolean; encodingAesKeyUsable: boolean;
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
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [configData, planData] = await Promise.all([api<VirtualConfig | null>('/admin/virtual-payment/config'), api<Plan[]>('/admin/virtual-payment/plans')]);
      setConfig(configData);
      setPlans(planData);
      if (configData) setForm({ appId: configData.appId, offerId: configData.offerId, appKey: '', pushToken: '', encodingAesKey: '', messageMode: configData.messageMode, dataFormat: configData.dataFormat, notifyUrl: configData.notifyUrl || '', enabled: configData.enabled });
    } catch (reason) { setError((reason as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  const saveConfig = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await patch('/admin/virtual-payment/config', {
        appId: form.appId.trim(), offerId: form.offerId.trim(), ...(form.appKey.trim() ? { appKey: form.appKey.trim() } : {}), ...(form.pushToken.trim() ? { pushToken: form.pushToken.trim() } : {}),
        ...(form.encodingAesKey.trim() ? {encodingAesKey: form.encodingAesKey.trim()} : {}), messageMode: form.messageMode, dataFormat: form.dataFormat, notifyUrl: form.notifyUrl.trim() || null, enabled: form.enabled,
      });
      setForm((current) => ({ ...current, appKey: '', encodingAesKey: '' })); toast({ title: '小程序虚拟支付配置已保存', tone: 'success' }); await load();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };

  const createPlan = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await post('/admin/virtual-payment/plans', { ...plan, priceFen: Number(plan.priceFen), membershipDays: Number(plan.membershipDays), messageQuota: Number(plan.messageQuota), sortOrder: Number(plan.sortOrder) });
      setPlan(emptyPlan); toast({ title: '套餐已创建', tone: 'success' }); await load();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };

  const deletePlan = async (item: Plan) => {
    setBusy(true); setError('');
    try { await post(`/admin/virtual-payment/plans/${item.id}/delete`); toast({ title: '套餐已删除', tone: 'success' }); await load(); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };

  if (!config && !plans) return error ? <ErrorState message={error} retry={load} /> : <LoadingState />;
  return <Page>
    <PageHeader eyebrow="Payment console" title="支付与套餐" description="小程序使用微信虚拟支付，网页端使用支付宝订单码支付；明文密钥仅在提交时传输并由服务端加密保存。" actions={<><Button asChild variant="outline"><Link to="/admin"><CreditCard className="h-4 w-4" />返回平台配置</Link></Button><Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />刷新</Button></>} />
    {error && <ErrorState message={error} />}
    <AlipaySettings/><Button asChild variant="outline"><Link to="/admin/orders">查看全部交易订单 →</Link></Button><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />小程序虚拟支付配置</CardTitle></CardHeader><CardContent>{config?.hasAppKey && !config.appKeyUsable && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">现有 AppKey 无法使用当前 APP_ENCRYPTION_KEY 解密，请重新填写现网 AppKey 并保存。</div>}<form className="grid gap-4 md:grid-cols-2" onSubmit={saveConfig}><Input label="小程序 AppID" value={form.appId} onChange={(value) => setForm({ ...form, appId: value })} /><Input label="OfferID" value={form.offerId} onChange={(value) => setForm({ ...form, offerId: value })} /><Input label={`现网 AppKey${config?.hasAppKey ? config.appKeyUsable ? '（已配置，留空表示不修改）' : '（无法解密，请重新填写）' : ''}`} value={form.appKey} onChange={(value) => setForm({ ...form, appKey: value })} type="password" required={!config?.hasAppKey || !config.appKeyUsable} /><Input label={`消息推送 Token${config?.hasPushToken ? '（已配置，留空表示不修改）' : ''}`} value={form.pushToken} onChange={(value) => setForm({ ...form, pushToken: value })} type="password" required={!config?.hasPushToken} /><Input label={`EncodingAESKey（兼容/安全模式）${config?.hasEncodingAesKey ? config.encodingAesKeyUsable ? '（已配置，留空表示不修改）' : '（无法解密，请重新填写）' : ''}`} value={form.encodingAesKey} onChange={(value) => setForm({ ...form, encodingAesKey: value })} required={form.messageMode !== 'PLAINTEXT' && (!config?.hasEncodingAesKey || !config.encodingAesKeyUsable)} /><Input label="推送 URL（可选，用于记录配置）" value={form.notifyUrl} onChange={(value) => setForm({ ...form, notifyUrl: value })} placeholder="https://你的域名/api/v1/virtual-payment/notify" required={false} /><label><span className="field-label">消息模式</span><select className="select" value={form.messageMode} onChange={(event) => setForm({ ...form, messageMode: event.target.value })}><option value="PLAINTEXT">明文</option><option value="COMPATIBLE">兼容</option><option value="SECURE">安全</option></select></label><label><span className="field-label">数据格式</span><select className="select" value={form.dataFormat} onChange={(event) => setForm({ ...form, dataFormat: event.target.value })}><option value="XML">XML</option><option value="JSON">JSON</option></select></label><label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />启用小程序虚拟支付</label><div className="md:col-span-2"><Button disabled={busy}><Save className="h-4 w-4" />保存配置</Button><p className="mt-2 text-xs text-neutral-500">推送地址应在微信后台配置为：你的域名 + <code>/api/v1/virtual-payment/notify</code>。明文模式不需要 EncodingAESKey；正式环境请确认已完成个人主体、工具类目、认证备案和平台审核。</p></div></form></CardContent></Card>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]"><Card><CardHeader><CardTitle>新增会员套餐</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={createPlan}><Input label="套餐编码" value={plan.code} onChange={(value) => setPlan({ ...plan, code: value })} placeholder="monthly" /><Input label="套餐名称" value={plan.name} onChange={(value) => setPlan({ ...plan, name: value })} placeholder="月度专业版" /><Input label="微信道具 ProductID" value={plan.productId} onChange={(value) => setPlan({ ...plan, productId: value })} /><Input label="价格（分）" value={plan.priceFen} onChange={(value) => setPlan({ ...plan, priceFen: value })} type="number" /><div className="grid gap-3 sm:grid-cols-3"><Input label="有效期（天）" value={plan.membershipDays} onChange={(value) => setPlan({ ...plan, membershipDays: value })} type="number" /><Input label="消息额度" value={plan.messageQuota} onChange={(value) => setPlan({ ...plan, messageQuota: value })} type="number" /><Input label="排序" value={plan.sortOrder} onChange={(value) => setPlan({ ...plan, sortOrder: value })} type="number" /></div><label><span className="field-label">说明</span><textarea className="textarea min-h-24" value={plan.description} onChange={(event) => setPlan({ ...plan, description: event.target.value })} /></label><Button className="w-full" disabled={busy}><Plus className="h-4 w-4" />创建套餐</Button></form></CardContent></Card><Card><CardHeader><CardTitle>已配置套餐</CardTitle></CardHeader><CardContent><div className="space-y-3">{plans?.map((item) => <div key={item.id} className="rounded-lg border border-neutral-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><b>{item.name}</b><span className="rounded bg-neutral-100 px-2 py-1 font-mono text-[10px]">{item.code}</span></div><p className="mt-1 text-sm text-neutral-500">{item.description}</p><p className="mt-2 text-xs text-neutral-500">¥{(item.priceFen / 100).toFixed(2)} · {item.membershipDays} 天 · {item.messageQuota || '不限'} 条额度 · ProductID {item.productId}</p></div><DeleteConfirm title={`删除套餐“${item.name}”？`} description="套餐会从购买页面移除，既有订单和会员权益记录仍会保留。" busy={busy} onConfirm={() => deletePlan(item)} trigger={<Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50"><Trash2 />删除</Button>} /></div></div>)}{!plans?.length && <p className="text-sm text-neutral-500">还没有套餐，请先创建。</p>}</div></CardContent></Card></div>
  </Page>;
}

function Input({ label, value, onChange, placeholder, type = 'text', required = true }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return <label className="block"><span className="field-label">{label}</span><input className="input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>;
}
