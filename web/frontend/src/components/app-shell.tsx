import { ChevronRight, LogOut, Menu, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, post, setToken } from '@/lib/api';
import { adminNavigation, navigation, routeLabel, type NavigationItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

type SessionUser = { username: string; email?: string; role?: string };
function NavigationLink({ item, onNavigate }: { item: NavigationItem; onNavigate: () => void }) {
  return <NavLink to={item.to} end={item.to === '/'} onClick={onNavigate} className={({ isActive }) => cn(
    'group flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
    isActive ? 'bg-white text-neutral-950' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
  )}>
    <item.icon className="mr-3 h-4 w-4" />{item.label}
    <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-50" />
  </NavLink>;
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SessionUser>();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { void api<SessionUser>('/auth/me').then(setUser).catch(() => undefined); }, []);
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const logout = async () => {
    await post('/auth/logout').catch(() => undefined);
    setToken(null);
    navigate('/login', { replace: true });
  };

  const sidebar = <>
    <div className="flex h-20 items-center border-b border-neutral-800 px-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-neutral-950"><Send className="h-4 w-4" /></div>
      <div className="ml-3"><p className="font-semibold tracking-tight text-white">WeChatSend</p><p className="font-mono text-[9px] uppercase tracking-[.26em] text-neutral-500">Client operations</p></div>
    </div>
    <nav className="flex-1 overflow-y-auto p-3">
      {navigation.map((group) => <div className="mb-4" key={group.label}>
        <p className="px-3 pb-1.5 pt-2 text-[9px] font-semibold uppercase tracking-[.22em] text-neutral-600">{group.label}</p>
        <div className="space-y-0.5">{group.items.map((item) => <NavigationLink key={item.to} item={item} onNavigate={() => setOpen(false)} />)}</div>
      </div>)}
      {user?.role === 'ADMIN' ? <div className="border-t border-neutral-800 pt-3"><NavigationLink item={adminNavigation} onNavigate={() => setOpen(false)} /></div> : null}
    </nav>
    <div className="border-t border-neutral-800 p-3">
      <div className="mb-2 px-3 py-2"><p className="truncate text-xs font-medium text-white">{user?.email || user?.username || '当前账号'}</p><p className="mt-1 text-[10px] text-neutral-500">{user?.role === 'ADMIN' ? '管理员' : '正式成员'}</p></div>
      <Button variant="ghost" className="w-full justify-start text-neutral-400 hover:bg-neutral-800 hover:text-white" onClick={logout}><LogOut className="h-4 w-4" />退出登录</Button>
    </div>
  </>;

  return <div className="app-canvas min-h-screen">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-neutral-950 lg:flex">{sidebar}</aside>
    {open ? <div className="fixed inset-0 z-40 bg-neutral-950/40 backdrop-blur-sm lg:hidden" onMouseDown={() => setOpen(false)}><aside className="flex h-full w-72 flex-col bg-neutral-950" onMouseDown={(event) => event.stopPropagation()}>{sidebar}</aside></div> : null}
    <header className="sticky top-0 z-20 flex h-16 items-center border-b border-neutral-200 bg-[#f6f6f3]/92 px-4 backdrop-blur-xl lg:ml-60 lg:px-8">
      <Button variant="ghost" size="icon" onClick={() => setOpen((value) => !value)} className="lg:hidden" aria-label="打开导航">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button>
      <div className="ml-2 lg:ml-0"><p className="font-mono text-[9px] uppercase tracking-[.22em] text-neutral-400">WeChatSend / Web</p><p className="mt-0.5 text-sm font-semibold text-neutral-900">{routeLabel(location.pathname)}</p></div>
      <div className="ml-auto flex items-center gap-2 text-[10px] text-neutral-500"><span className="h-1.5 w-1.5 rounded-full bg-neutral-950" />已登录</div>
    </header>
    <main className="lg:pl-60"><div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9"><Outlet /></div></main>
  </div>;
}
