import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';
type ToastInput = { title: string; description?: string; tone?: ToastTone; duration?: number };
type ToastItem = ToastInput & { id: number; tone: ToastTone };
type Notify = (toast: ToastInput) => void;

const ToastContext = createContext<Notify | null>(null);

const toneStyles: Record<ToastTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  error: 'border-red-200 bg-red-50 text-red-950',
  info: 'border-neutral-300 bg-white text-neutral-950',
};

const toneIcons = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback<Notify>((input) => {
    const id = ++sequence.current;
    const item: ToastItem = { ...input, id, tone: input.tone ?? 'info' };
    setItems((current) => [...current.slice(-3), item]);
    timers.current.set(id, setTimeout(() => dismiss(id), input.duration ?? 4500));
  }, [dismiss]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  return <ToastContext.Provider value={notify}>
    {children}
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-atomic="false">
      {items.map((item) => {
        const Icon = toneIcons[item.tone];
        return <div key={item.id} role={item.tone === 'error' ? 'alert' : 'status'} className={cn('pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg shadow-black/5', toneStyles[item.tone])}>
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{item.title}</p>
            {item.description ? <p className="mt-1 text-xs leading-5 opacity-75">{item.description}</p> : null}
          </div>
          <button type="button" onClick={() => dismiss(item.id)} className="rounded-md p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" aria-label="关闭提示"><X className="h-3.5 w-3.5" /></button>
        </div>;
      })}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast 必须在 ToastProvider 内使用');
  return notify;
}
