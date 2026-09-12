import { Check, Mail, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Dialog } from '@/components/dialog';
import { DeleteConfirm } from '@/components/delete-confirm';
import { FormField } from '@/components/form-field';
import { Page, PageHeader } from '@/components/page';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useResource } from '@/hooks/use-resource';
import { api, patch, post } from '@/lib/api';
import type { Account } from '@/types';

const emptyForm = { name: '', recipientEmail: '', subject: 'WeChatSend', minDelay: 10, maxDelay: 15 };

export function AccountsPage() {
  const accounts = useResource(() => api<Account[]>('/accounts'), []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string>();
  const [verify, setVerify] = useState<Account>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const closeForm = () => { setShowForm(false); setEditingId(undefined); setForm(emptyForm); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (form.minDelay < 10 || form.maxDelay < form.minDelay) {
      accounts.setError('发送间隔至少为 10 秒，且最大间隔不能小于最小间隔');
      return;
    }
    setBusy(true); accounts.setError('');
    try {
      if (editingId) await patch(`/accounts/${editingId}`, form);
      else await post('/accounts', form);
      closeForm();
      await accounts.reload();
    } catch (reason) { accounts.setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const edit = (account: Account) => {
    setEditingId(account.id);
    setForm({ name: account.name, recipientEmail: account.recipientEmail, subject: account.subject, minDelay: account.minDelay, maxDelay: account.maxDelay });
    setShowForm(true);
  };
  const sendCode = async (account: Account) => {
    setVerify(account); setBusy(true); accounts.setError('');
    try { await post(`/accounts/${account.id}/verification`); }
    catch (reason) { accounts.setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const confirmVerification = async () => {
    if (!verify) return;
    setBusy(true); accounts.setError('');
    try {
      await post(`/accounts/${verify.id}/verification/confirm`, { code });
      setVerify(undefined); setCode('');
      await accounts.reload();
    } catch (reason) { accounts.setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (account: Account) => {
    accounts.setError('');
    try {
      await post(`/accounts/${account.id}/delete`);
      await accounts.reload();
    } catch (reason) { accounts.setError((reason as Error).message); }
  };

  return <Page>
    <PageHeader eyebrow="Delivery channels" title="发送账号" description="一个发送账号固定对应一台 iPhone 和一个已验证接收邮箱。" actions={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" />添加账号</Button>} />
    {accounts.error ? <ErrorState message={accounts.error} retry={accounts.reload} /> : null}
    {accounts.loading && !accounts.data ? <LoadingState /> : accounts.data?.length === 0 ? <EmptyState title="还没有发送账号" detail="先填写手机接收邮件的地址，再按引导完成邮箱验证。" action={{ label: '添加账号', onClick: () => setShowForm(true) }} /> : accounts.data ? <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="hidden grid-cols-[1.1fr_1.6fr_.8fr_180px] gap-4 border-b border-neutral-200 bg-neutral-50 px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-neutral-500 md:grid"><span>账号</span><span>接收邮箱</span><span>发送间隔</span><span>操作</span></div>
      {accounts.data.map((account) => <article key={account.id} className="grid gap-3 border-b border-neutral-100 px-5 py-5 last:border-0 md:grid-cols-[1.1fr_1.6fr_.8fr_180px] md:items-center md:gap-4">
        <div><p className="font-medium">{account.name}</p><p className="mt-1 text-xs text-neutral-400">{account._count.friends} 位好友</p></div>
        <div><p className="break-all text-sm">{account.recipientEmail}</p>{account.emailVerifiedAt ? <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3 w-3" />邮箱已验证</p> : <button type="button" onClick={() => void sendCode(account)} className="mt-1 text-xs font-medium underline underline-offset-4">验证邮箱</button>}</div>
        <p className="font-mono text-sm">{account.minDelay === account.maxDelay ? `${account.minDelay}s` : `${account.minDelay}–${account.maxDelay}s`}</p>
        <div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => edit(account)}>编辑</Button><DeleteConfirm title={`删除“${account.name}”？`} description="账号及其好友将从工作台移除，历史任务记录仍会保留。存在待发送任务时系统会拒绝删除。" onConfirm={() => remove(account)} trigger={<Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 />删除</Button>} /></div>
      </article>)}
    </section> : null}

    <Dialog open={showForm} onClose={closeForm} title={editingId ? '编辑发送账号' : '添加发送账号'} description="填写 iPhone 邮件自动化实际接收地址。">
      <form className="space-y-5" onSubmit={save}>
        <FormField label="账号名称" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：销售一号机" required /></FormField>
        <FormField label="接收邮箱" required><Input type="email" value={form.recipientEmail} onChange={(event) => setForm({ ...form, recipientEmail: event.target.value })} placeholder="name@example.com" required /></FormField>
        <FormField label="邮件主题" hint="必须与 iPhone 邮件自动化中的主题完全一致。" required><Input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required /></FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="最小间隔（秒）"><Input type="number" min="10" value={form.minDelay} onChange={(event) => setForm({ ...form, minDelay: Number(event.target.value) })} /></FormField>
          <FormField label="最大间隔（秒）"><Input type="number" min="10" value={form.maxDelay} onChange={(event) => setForm({ ...form, maxDelay: Number(event.target.value) })} /></FormField>
        </div>
        <Button className="w-full" disabled={busy}>{busy ? '正在保存…' : '保存账号'}</Button>
      </form>
    </Dialog>

    <Dialog open={Boolean(verify)} onClose={() => { setVerify(undefined); setCode(''); }} title="验证接收邮箱" description={verify ? `验证码已发送到 ${verify.recipientEmail}，10 分钟内有效。` : undefined} className="max-w-sm">
      <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100"><ShieldCheck className="h-5 w-5" /></span>
      <FormField label="6 位验证码"><Input inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" /></FormField>
      <div className="mt-5 flex gap-3"><Button variant="outline" className="flex-1" onClick={() => verify && void sendCode(verify)} disabled={busy}><Mail className="h-4 w-4" />重新发送</Button><Button className="flex-1" onClick={() => void confirmVerification()} disabled={busy || code.length !== 6}>确认验证</Button></div>
    </Dialog>
  </Page>;
}
