import { Bot, BookOpenText, BookUser, Braces, CreditCard, LayoutDashboard, MessageSquareText, Radio, ReceiptText, Settings2, UserRound, type LucideIcon } from 'lucide-react';

export type NavigationItem = { to: string; label: string; icon: LucideIcon };
export type NavigationGroup = { label: string; items: NavigationItem[] };

export const navigation: NavigationGroup[] = [
  { label: '运营', items: [
    { to: '/', label: '工作台', icon: LayoutDashboard },
    { to: '/tasks', label: '发送任务', icon: MessageSquareText },
  ] },
  { label: '客户', items: [
    { to: '/accounts', label: '发送账号', icon: Radio },
    { to: '/friends', label: '好友管理', icon: BookUser },
  ] },
  { label: '内容', items: [
    { to: '/templates', label: '文案模板', icon: BookOpenText },
    { to: '/variables', label: '内容变量', icon: Braces },
    { to: '/ai', label: 'AI 助手', icon: Bot },
  ] },
  { label: '账户', items: [
    { to: '/membership', label: '会员套餐', icon: CreditCard },
    { to: '/orders', label: '订单记录', icon: ReceiptText },
    { to: '/profile', label: '个人中心', icon: UserRound },
  ] },
] ;

export const adminNavigation: NavigationItem = { to: '/admin', label: '平台管理', icon: Settings2 };

export function routeLabel(pathname: string) {
  if (pathname.startsWith('/tasks/new')) return '创建发送任务';
  if (/^\/tasks\/[^/]+/.test(pathname)) return '任务详情';
  if (pathname.startsWith('/admin/payment')) return '支付与套餐配置';
  if (pathname.startsWith('/admin/templates')) return '内容库审核';
  if (pathname.startsWith('/admin/orders')) return '全部交易订单';
  if (pathname.startsWith('/admin')) return '平台管理';
  return navigation.flatMap((group) => group.items).find((item) => item.to === pathname)?.label ?? 'WeChatSend';
}
