import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';

export function LoadingState({ label = '正在加载' }: { label?: string }) {
  return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-neutral-500"><LoaderCircle className="h-4 w-4 animate-spin" />{label}</div>;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-6 text-center">
      <span className="mb-4 rounded-full border border-neutral-200 p-3"><Inbox className="h-5 w-5" /></span>
      <p className="font-semibold">{title}</p><p className="mt-1 max-w-sm text-sm leading-6 text-neutral-500">{detail}</p>
      {action && <Button className="mt-5" size="sm" onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1"><p>{message}</p>{retry && <button className="mt-2 underline" onClick={retry}>重新加载</button>}</div>
    </div>
  );
}
