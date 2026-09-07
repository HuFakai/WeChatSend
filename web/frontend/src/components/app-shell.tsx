import { BookUser, ChevronRight, LayoutDashboard, LogOut, Menu, MessageSquareText, Radio, Send, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { setToken } from '@/lib/api';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/', label: '工作台', icon: LayoutDashboard },
  { to: '/accounts', label: '发送账号', icon: Radio },
  { to: '/friends', label: '好友管理', icon: BookUser },
  { to: '/tasks', label: '发送任务', icon: MessageSquareText },
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const logout = () => { setToken(null); navigate('/login', { replace: true }); };

  const sidebar = (
    <>
      <div className="flex h-20 items-center border-b border-neutral-200 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white"><Send className="h-4 w-4" /></div>
        <div className="ml-3"><p className="font-semibold tracking-tight">WeChatSend</p><p className="font-mono text-[10px] uppercase tracking-[.22em] text-neutral-400">Message Desk</p></div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[.2em] text-neutral-400">工作区</p>
        {nav.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => cn('group flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors', isActive ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:bg-neutral-100 hover:text-black')}><item.icon className="mr-3 h-4 w-4" />{item.label}<ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" /></NavLink>)}
      </nav>
      <div className="border-t border-neutral-200 p-3"><Button variant="ghost" className="w-full justify-start" onClick={logout}><LogOut className="h-4 w-4" />退出登录</Button></div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-neutral-200 bg-white lg:flex">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)}><aside className="flex h-full w-72 flex-col bg-white" onClick={(e) => e.stopPropagation()}>{sidebar}</aside></div>}
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-neutral-200 bg-white/90 px-4 backdrop-blur lg:hidden"><Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button><span className="ml-2 font-semibold">WeChatSend</span></header>
      <main className="lg:pl-64"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9"><Outlet /></div></main>
    </div>
  );
}
