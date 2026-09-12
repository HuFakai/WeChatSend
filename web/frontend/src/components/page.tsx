import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('page-enter space-y-7', className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="flex flex-col gap-5 border-b border-neutral-300 pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div className="max-w-3xl">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[.28em] text-neutral-500">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] text-neutral-950 sm:text-4xl">{title}</h1>
      {description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">{description}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
  </header>;
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-4">
    <div><h2 className="text-base font-semibold tracking-tight text-neutral-950">{title}</h2>{description ? <p className="mt-1 text-xs leading-5 text-neutral-500">{description}</p> : null}</div>
    {action}
  </div>;
}

export function Metric({ label, value, icon: Icon, detail, dark = false }: { label: string; value: string | number; icon: LucideIcon; detail?: string; dark?: boolean }) {
  return <div className={cn('rounded-2xl border p-5', dark ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 bg-white')}>
    <div className="flex items-center justify-between"><span className={cn('text-xs font-medium', dark ? 'text-neutral-400' : 'text-neutral-500')}>{label}</span><Icon className={cn('h-4 w-4', dark ? 'text-neutral-500' : 'text-neutral-400')} /></div>
    <p className="mt-7 font-mono text-3xl font-medium tracking-[-.06em]">{value}</p>
    {detail ? <p className={cn('mt-2 text-xs', dark ? 'text-neutral-500' : 'text-neutral-500')}>{detail}</p> : null}
  </div>;
}

export function Definition({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{label}</dt><dd className="mt-1 text-sm text-neutral-900">{children}</dd></div>;
}
