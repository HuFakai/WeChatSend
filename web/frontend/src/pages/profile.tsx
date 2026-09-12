import { Mail, QrCode, ReceiptText, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmailIdentityForm, WechatIdentityForm } from '@/components/identity-forms';
import { Page, PageHeader, SectionHeading } from '@/components/page';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/toast';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';

type Profile = { username: string; email?: string; hasMiniOpenid: boolean };

export function ProfilePage() {
  const profile = useResource(() => api<Profile>('/auth/me'), []);
  const [binding, setBinding] = useState<'email' | 'wechat' | ''>('');
  const toast = useToast();
  const done = () => { setBinding(''); toast({ title: '账号绑定成功', description: '身份与业务数据已经同步。', tone: 'success' }); void profile.reload(); };

  if (profile.loading && !profile.data) return <LoadingState />;
  return <Page>
    <PageHeader eyebrow="Identity & security" title="个人中心" description="邮箱与微信是同一个平台身份，两端共享客户、任务、订单和会员权益。" actions={<Button asChild variant="outline"><Link to="/orders"><ReceiptText className="h-4 w-4" />订单记录</Link></Button>} />
    {profile.error ? <ErrorState message={profile.error} retry={profile.reload} /> : null}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
      <Card className="p-6">
        <div className="flex items-center gap-4 border-b border-neutral-200 pb-6"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-950 text-lg font-semibold text-white">{profile.data?.username?.slice(0, 1).toUpperCase() || 'U'}</span><div><h2 className="text-xl font-semibold">{profile.data?.username || '当前账号'}</h2><p className="mt-1 text-xs text-neutral-500">统一身份账号</p></div></div>
        <div className="divide-y divide-neutral-100">
          <IdentityRow icon={Mail} title="邮箱账号" value={profile.data?.email || '尚未绑定'} action={<Button variant="outline" size="sm" onClick={() => setBinding(binding === 'email' ? '' : 'email')}>{profile.data?.email ? '更换邮箱' : '绑定邮箱'}</Button>} />
          <IdentityRow icon={QrCode} title="微信小程序" value={profile.data?.hasMiniOpenid ? '已绑定，可通过微信扫码登录' : '尚未绑定'} action={!profile.data?.hasMiniOpenid ? <Button variant="outline" size="sm" onClick={() => setBinding(binding === 'wechat' ? '' : 'wechat')}>扫码绑定</Button> : <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />已验证</span>} />
        </div>
      </Card>
      <div>
        <SectionHeading title={binding === 'email' ? '验证邮箱' : binding === 'wechat' ? '绑定微信身份' : '账号安全'} description={binding ? '完成后会合并到当前账号，不会创建重复业务数据。' : '选择左侧身份入口进行绑定或更换。'} />
        <Card className="p-6">{binding === 'email' ? <EmailIdentityForm bind onSuccess={done} /> : binding === 'wechat' ? <WechatIdentityForm bind onSuccess={done} /> : <div className="flex min-h-52 flex-col items-center justify-center text-center"><ShieldCheck className="h-8 w-8 text-neutral-300" /><p className="mt-4 text-sm font-medium">身份状态正常</p><p className="mt-1 max-w-xs text-xs leading-5 text-neutral-500">请妥善保护邮箱和微信账号；平台不会向前端返回服务端密钥。</p></div>}</Card>
      </div>
    </div>
  </Page>;
}

function IdentityRow({ icon: Icon, title, value, action }: { icon: typeof Mail; title: string; value: string; action: ReactNode }) {
  return <div className="flex items-center gap-4 py-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{title}</p><p className="mt-1 truncate text-xs text-neutral-500">{value}</p></div>{action}</div>;
}
