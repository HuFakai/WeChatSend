import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { EmailIdentityForm,WechatIdentityForm } from '@/components/identity-forms';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states';
export function ProfilePage(){
  const [user,setUser]=useState<{username:string;email?:string;hasMiniOpenid:boolean}>(),[binding,setBinding]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const load=()=>void api<typeof user>('/auth/me').then(setUser).catch(e=>setError(e.message));useEffect(load,[]);
  const done=()=>{setBinding('');setNotice('账号绑定成功，身份与数据已同步。');load();};
  return <div className="space-y-6"><header><p className="text-xs uppercase tracking-widest text-emerald-700">Identity & Security</p><h1 className="mt-2 text-3xl font-semibold">个人中心</h1><p className="mt-2 text-sm text-neutral-500">邮箱与微信使用同一个平台身份，两端共享业务数据与会员权益。</p></header>{error&&<ErrorState message={error}/>}<Card><CardContent className="space-y-5 p-6"><h2 className="text-xl font-semibold">{user?.username||'加载账号…'}</h2>{notice&&<p role="status" className="text-emerald-700">{notice}</p>}<div className="flex items-center justify-between border-t py-4"><div><b>邮箱账号</b><p className="mt-1 text-sm text-neutral-500">{user?.email||'尚未绑定'}</p></div><Button variant="outline" onClick={()=>setBinding(binding==='email'?'':'email')}>{user?.email?'更换邮箱':'绑定邮箱'}</Button></div><div className="flex items-center justify-between border-t py-4"><div><b>微信小程序</b><p className="mt-1 text-sm text-neutral-500">{user?.hasMiniOpenid?'已绑定，可通过微信扫码登录':'尚未绑定'}</p></div>{!user?.hasMiniOpenid&&<Button variant="outline" onClick={()=>setBinding(binding==='wechat'?'':'wechat')}>微信扫码绑定</Button>}</div><Link className="text-sm text-emerald-700 underline" to="/orders">查看我的订单与支付记录 →</Link></CardContent></Card>{binding&&<Card className="max-w-lg"><CardHeader><CardTitle>{binding==='email'?'验证邮箱':'微信身份绑定'}</CardTitle></CardHeader><CardContent>{binding==='email'?<EmailIdentityForm bind onSuccess={done}/>:<WechatIdentityForm bind onSuccess={done}/>}</CardContent></Card>}</div>;
}
