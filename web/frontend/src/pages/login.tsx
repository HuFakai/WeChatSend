import { ArrowUpRight, Send } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmailIdentityForm, WechatIdentityForm } from '@/components/identity-forms';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { post, setToken } from '@/lib/api';
import { cn } from '@/lib/utils';

const modes = [{ value: 'email', label: '邮箱' }, { value: 'wechat', label: '微信扫码' }, { value: 'password', label: '账号密码' }] as const;

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<(typeof modes)[number]['value']>('email');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const success = () => navigate('/', { replace: true });

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try { const result = await post<{ token: string }>('/auth/login', { username, password }); setToken(result.token); success(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  };

  return <main className="grid min-h-screen bg-[#f6f6f3] lg:grid-cols-[minmax(0,1.15fr)_minmax(460px,.85fr)]">
    <section className="relative hidden overflow-hidden bg-neutral-950 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px,#777 1px,transparent 0)', backgroundSize: '28px 28px' }} />
      <div className="relative flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-neutral-950"><Send className="h-5 w-5" /></span><span className="font-semibold tracking-tight">WeChatSend</span></div>
      <div className="relative max-w-2xl"><p className="font-mono text-[10px] uppercase tracking-[.32em] text-neutral-500">Client relationship operations</p><h1 className="mt-6 text-5xl font-semibold leading-[1.06] tracking-[-.055em] xl:text-6xl">每一位客户，<br />都值得被认真触达。</h1><p className="mt-7 max-w-lg text-base leading-7 text-neutral-400">管理微信好友、组织内容、安排发送，并追踪每一条消息的真实执行结果。</p></div>
      <div className="relative grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-neutral-800 bg-neutral-800">{['一人一邮件', '服务端控速', '逐条结果反馈'].map((item, index) => <div key={item} className="bg-neutral-950 p-4"><span className="font-mono text-[10px] text-neutral-600">0{index + 1}</span><p className="mt-6 text-xs text-neutral-300">{item}</p></div>)}</div>
    </section>
    <section className="flex items-center justify-center px-5 py-12 sm:px-10">
      <div className="page-enter w-full max-w-md">
        <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-white"><Send className="h-5 w-5" /></span><span className="font-semibold">WeChatSend</span></div>
        <div className="mb-7"><p className="font-mono text-[10px] uppercase tracking-[.28em] text-neutral-400">Secure access</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">欢迎回来</h2><p className="mt-2 text-sm text-neutral-500">选择一种身份进入客户运营工作台</p></div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_20px_60px_rgba(0,0,0,.05)]">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1">{modes.map((item) => <button type="button" key={item.value} onClick={() => { setMode(item.value); setError(''); }} className={cn('rounded-lg px-2 py-2.5 text-xs font-medium transition-colors', mode === item.value ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-950')}>{item.label}</button>)}</div>
          <div className="p-5 sm:p-6">{mode === 'email' ? <EmailIdentityForm onSuccess={success} /> : mode === 'wechat' ? <WechatIdentityForm onSuccess={success} /> : <>{error ? <div className="mb-5"><ErrorState message={error} /></div> : null}<form className="space-y-5" onSubmit={submit}><label><span className="field-label">账号</span><Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入账号" required /></label><label><span className="field-label">密码</span><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" required /></label><Button className="w-full" size="lg" disabled={loading}>{loading ? '正在登录' : <>登录 <ArrowUpRight className="h-4 w-4" /></>}</Button></form></>}</div>
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-neutral-400">邮箱与微信可以在个人中心绑定；已有内测账号仍可使用账号密码。</p>
      </div>
    </section>
  </main>;
}
