import { BookOpenText, BookUser, Braces, Bot, ChevronRight, CreditCard, LayoutDashboard, LogOut, Menu, MessageSquareText, Radio, Send, Settings2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, post, setToken } from '@/lib/api';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/profile', label:'个人中心', icon: BookUser },
  { to: '/orders', label:'订单记录', icon: CreditCard },
  { to: '/', label: '工作台', icon: LayoutDashboard },
  { to: '/accounts', label: '发送账号', icon: Radio },
  { to: '/friends', label: '好友管理', icon: BookUser },
  { to: '/templates', label: '文案模板', icon: BookOpenText },
  { to: '/variables', label: '内容变量', icon: Braces },
  { to: '/tasks', label: '发送任务', icon: MessageSquareText },
  { to: '/ai', label: 'AI 助手', icon: Bot },
  { to: '/membership', label: '会员套餐', icon: CreditCard },
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { void api<{ role?: string }>('/auth/me').then((user) => setIsAdmin(user.role === 'ADMIN')).catch(() => undefined); }, []);
  const logout = async () => { await post('/auth/logout').catch(()=>undefined); setToken(null); navigate('/login', { replace: true }); };

  const sidebar = (
    <>
      <div className="flex h-20 items-center border-b border-neutral-200 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white"><Send className="h-4 w-4" /></div>
        <div className="ml-3"><p className="font-semibold tracking-tight">WeChatSend</p><p className="font-mono text-[10px] uppercase tracking-[.22em] text-neutral-400">Message Desk</p></div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[.2em] text-neutral-400">工作区</p>
        {nav.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => cn('group flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors', isActive ? 'bg-emerald-700 text-white' : 'text-neutral-600 hover:bg-emerald-50 hover:text-emerald-900')}><item.icon className="mr-3 h-4 w-4" />{item.label}<ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" /></NavLink>)}
        {isAdmin && <NavLink to="/admin" end onClick={() => setOpen(false)} className={({ isActive }) => cn('group flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors', isActive ? 'bg-emerald-700 text-white' : 'text-neutral-600 hover:bg-emerald-50 hover:text-emerald-900')}><Settings2 className="mr-3 h-4 w-4" />平台配置<ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" /></NavLink>}
      </nav>
      <div className="border-t border-neutral-200 p-3"><Button variant="ghost" className="w-full justify-start" onClick={logout}><LogOut className="h-4 w-4" />退出登录</Button></div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f0fdf4]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-neutral-200 bg-white lg:flex">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)}><aside className="flex h-full w-72 flex-col bg-white" onClick={(e) => e.stopPropagation()}>{sidebar}</aside></div>}
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-neutral-200 bg-white/90 px-4 backdrop-blur lg:hidden"><Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button><span className="ml-2 font-semibold">WeChatSend</span></header>
      <main className="lg:pl-64"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9"><Outlet /></div></main>
    </div>
  );
}
