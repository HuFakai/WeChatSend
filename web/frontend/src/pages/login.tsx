import { EmailIdentityForm, WechatIdentityForm } from '@/components/identity-forms';
import { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { post, setToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/states';

export function LoginPage() {
  const navigate = useNavigate();
  const [mode,setMode]=useState('email');
  const success=()=>navigate('/',{replace:true});
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const result = await post<{ token: string }>('/auth/login', { username, password });
      setToken(result.token); navigate('/', { replace: true });
    } catch (reason) { setError((reason as Error).message); } finally { setLoading(false); }
  };
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_560px]">
      <section className="relative hidden overflow-hidden border-r border-emerald-900 bg-emerald-950 p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-[.08]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="relative flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900"><Send className="h-5 w-5" /></span><span className="text-lg font-semibold">WeChatSend</span></div>
        <div className="relative max-w-xl"><p className="font-mono text-xs uppercase tracking-[.3em] text-neutral-500">One message. One person.</p><h1 className="mt-5 text-5xl font-semibold leading-[1.08] tracking-[-.04em]">让每一次客户触达，<br />简单而可控。</h1><p className="mt-6 max-w-lg text-base leading-7 text-neutral-400">从任务创建、邮件投递到逐条记录，在一个安静的工作台里完成。</p></div>
        <p className="relative font-mono text-xs text-neutral-600">WEB + MINI PROGRAM / ONE IDENTITY</p>
      </section>
      <section className="flex items-center justify-center bg-[#f0fdf4] px-5 py-12">
        <div className="w-full max-w-sm page-enter">
          <div className="mb-8 lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-white"><Send className="h-5 w-5" /></span><h1 className="mt-5 text-2xl font-semibold">登录 WeChatSend</h1></div>
          <Card className="shadow-[0_14px_50px_rgba(0,0,0,.06)]"><CardContent className="p-7"><div className="mb-7 hidden lg:block"><h2 className="text-2xl font-semibold tracking-tight">欢迎回来</h2><p className="mt-2 text-sm text-neutral-500">选择邮箱或微信身份进入工作台</p></div><div className="mb-6 flex gap-1 rounded-lg bg-neutral-100 p-1">{[['email','邮箱登录'],['wechat','微信登录'],['password','账号密码']].map(([key,label])=><button type="button" key={key} onClick={()=>{setMode(key);setError('');}} className={'flex-1 rounded-md px-2 py-2 text-sm '+(mode===key?'bg-white shadow-sm':'text-neutral-500')}>{label}</button>)}</div>{mode==='email'?<EmailIdentityForm onSuccess={success}/>:mode==='wechat'?<WechatIdentityForm onSuccess={success}/>:<>{error && <div className="mb-5"><ErrorState message={error} /></div>}<form className="space-y-5" onSubmit={submit}><label><span className="field-label">账号</span><Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="请输入账号" required /></label><label><span className="field-label">密码</span><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" required /></label><Button className="w-full" size="lg" disabled={loading}>{loading ? '正在登录…' : '登录'}</Button></form></>}<p className="mt-6 text-center text-xs leading-5 text-neutral-400">邮箱和微信可在个人中心绑定，账号密码入口兼容已有账号</p></CardContent></Card>
        </div>
      </section>
    </main>
  );
}
