import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, post, setToken } from '@/lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ErrorState } from './states';

export function EmailIdentityForm({bind=false,onSuccess}:{bind?:boolean;onSuccess:()=>void}){
  const [email,setEmail]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[cooldown,setCooldown]=useState(0);
  useEffect(()=>{if(!cooldown)return;const t=setTimeout(()=>setCooldown(cooldown-1),1000);return()=>clearTimeout(t);},[cooldown]);
  const send=async()=>{setBusy(true);setError('');try{const r=await post<{challengeId:string}>(bind?'/auth/email/bind/code':'/auth/email/code',{email});setChallenge(r.challengeId);setCooldown(60);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const r=await post<{token:string}>(bind?'/auth/email/bind':'/auth/email/login',{email,code,challengeId:challenge});setToken(r.token);onSuccess();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <form className="space-y-4" onSubmit={submit}>{error&&<ErrorState message={error}/>}<label className="block"><span className="field-label">邮箱地址</span><Input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>{setEmail(e.target.value);setChallenge('');}}/></label><div className="flex gap-2"><Input aria-label="验证码" inputMode="numeric" autoComplete="one-time-code" placeholder="6 位验证码" value={code} maxLength={6} onChange={e=>setCode(e.target.value)}/><Button type="button" variant="outline" disabled={busy||cooldown>0||!email} onClick={()=>void send()}>{cooldown?`${cooldown} 秒`:'获取验证码'}</Button></div>{challenge&&<p role="status" className="text-xs text-emerald-700">验证码已发送，10 分钟内有效，请检查收件箱及垃圾邮件。</p>}<Button className="w-full" disabled={busy||!challenge||code.length!==6}>{busy?'正在处理…':bind?'验证并绑定邮箱':'邮箱登录 / 注册'}</Button><p className="text-xs leading-6 text-neutral-500">{bind?'如邮箱已有账号，验证后将合并身份及业务记录；存在数据冲突时会提示处理，不会覆盖。':'未注册的邮箱验证成功后将自动创建账号。'}</p></form>;
}
type Ticket={id:string;pollSecret:string;qrDataUrl?:string;qrError?:string;devTicket?:string;expiresAt:string};
export function WechatIdentityForm({bind=false,onSuccess}:{bind?:boolean;onSuccess:()=>void}){
  const [ticket,setTicket]=useState<Ticket>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expired,setExpired]=useState(false);
  const success=useRef(onSuccess);success.current=onSuccess;
  const create=async()=>{setBusy(true);setError('');setTicket(undefined);setExpired(false);try{setTicket(await post<Ticket>(bind?'/auth/scan/bind':'/auth/scan/tickets'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  useEffect(()=>{void create();},[bind]);
  useEffect(()=>{
    if(!ticket)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      if(stopped)return;if(Date.now()>=new Date(ticket.expiresAt).getTime()){setExpired(true);return;}
      try{const r=await api<{status:string;token?:string}>(`/auth/scan/${ticket.id}/poll`,{headers:{'x-poll-secret':ticket.pollSecret}});if(stopped)return;if(r.status==='APPROVED'&&r.token){setToken(r.token);success.current();return;}if(r.status==='EXPIRED'){setExpired(true);return;}}catch(e){if(!stopped)setError((e as Error).message);}
      if(!stopped)timer=setTimeout(()=>void poll(),2500);
    };timer=setTimeout(()=>void poll(),2500);return()=>{stopped=true;clearTimeout(timer);};
  },[ticket]);
  return <div className="space-y-4 text-center">{error&&<ErrorState message={error}/>}<div className="mx-auto flex min-h-56 max-w-64 items-center justify-center rounded-xl border border-neutral-200 bg-white p-4">{expired?<p>二维码已过期</p>:ticket?.qrDataUrl?<img className="w-full" src={ticket.qrDataUrl} alt="微信小程序登录码"/>:<p className="text-sm text-neutral-500">{busy?'正在生成小程序码…':ticket?.qrError||'暂无法生成二维码'}</p>}</div><p className="text-sm text-neutral-600">使用微信扫一扫，在小程序内确认{bind?'绑定':'登录'}。</p>{ticket?.devTicket&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs leading-6"><b>开发联调 · Ticket</b><code className="block select-all break-all">{ticket.devTicket}</code><p>开发者工具页面：pages/scan/index</p><code className="break-all">scene={ticket.devTicket}</code></div>}<Button variant="outline" disabled={busy} onClick={()=>void create()}>刷新二维码</Button></div>;
}
