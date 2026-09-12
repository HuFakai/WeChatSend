import { FormEvent, useEffect, useState } from 'react';
import { api, patch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ErrorState } from './states';
import { useToast } from './toast';

const initial = {
  appId: '',
  notifyUrl: '',
  expireMinutes: 30,
  enabled: false,
  privateKey: '',
  publicKey: '',
  hasPrivateKey: false,
  hasPublicKey: false,
};

export function AlipaySettings() {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<typeof initial>('/admin/alipay/config')
      .then((settings) => setForm({ ...initial, ...settings }))
      .catch((reason) => setError(reason.message));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { hasPrivateKey, hasPublicKey, privateKey, publicKey, ...values } = form;
      const settings = await patch<typeof initial>('/admin/alipay/config', {
        ...values,
        ...(privateKey ? { privateKey } : {}),
        ...(publicKey ? { publicKey } : {}),
      });
      setForm({ ...initial, ...settings });
      toast({ title: '支付宝配置已保存', description: '新订单使用新配置，已有订单保留原配置快照。', tone: 'success' });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>支付宝订单码支付配置</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
          {error && <div className="md:col-span-2"><ErrorState message={error} /></div>}
          <label>
            <span className="field-label">支付宝应用 AppID</span>
            <input className="input" required inputMode="numeric" value={form.appId} onChange={(event) => setForm({ ...form, appId: event.target.value })} />
          </label>
          <label>
            <span className="field-label">订单有效期（分钟）</span>
            <input type="number" className="input" required min={5} max={120} value={form.expireMinutes} onChange={(event) => setForm({ ...form, expireMinutes: Number(event.target.value) })} />
          </label>
          <label className="md:col-span-2">
            <span className="field-label">异步通知 HTTPS 地址</span>
            <input className="input" required type="url" value={form.notifyUrl} placeholder="https://你的域名/api/v1/alipay/notify" onChange={(event) => setForm({ ...form, notifyUrl: event.target.value })} />
          </label>
          {(['privateKey', 'publicKey'] as const).map((key) => (
            <label key={key}>
              <span className="field-label">
                {key === 'privateKey' ? '应用私钥（Node.js 使用支付宝提供的 PKCS#1 原值）' : '支付宝公钥'}（{form[key === 'privateKey' ? 'hasPrivateKey' : 'hasPublicKey'] ? '已配置，留空不修改' : '未配置'}）
              </span>
              <textarea className="textarea min-h-28 font-mono text-xs" autoComplete="off" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />启用支付宝支付
          </label>
          <div className="md:col-span-2">
            <Button disabled={busy}>保存支付宝配置</Button>
            <p className="mt-3 text-xs leading-6 text-neutral-500">网关、RSA2 签名及私钥类型由服务端按 Node.js 订单码规范固定。私钥加密保存且不回传；生产收款前请完成签约和小额人工验收。</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
