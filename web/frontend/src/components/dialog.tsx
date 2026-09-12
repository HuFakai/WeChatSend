import type { MouseEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Dialog({ open, onClose, title, description, children, className }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string }) {
  if (!open) return null;
  const stop = (event: MouseEvent) => event.stopPropagation();
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={onClose} role="presentation">
    <section className={cn('max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-neutral-300 bg-white shadow-2xl sm:rounded-2xl', className)} onMouseDown={stop} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <header className="sticky top-0 z-10 flex items-start gap-4 border-b border-neutral-200 bg-white/95 p-5 backdrop-blur">
        <div className="min-w-0 flex-1"><h2 id="dialog-title" className="text-xl font-semibold tracking-tight">{title}</h2>{description ? <p className="mt-1 text-sm leading-6 text-neutral-500">{description}</p> : null}</div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭"><X className="h-4 w-4" /></Button>
      </header>
      <div className="p-5">{children}</div>
    </section>
  </div>;
}
