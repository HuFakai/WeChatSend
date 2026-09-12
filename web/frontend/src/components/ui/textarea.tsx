import * as React from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn('min-h-28 w-full resize-y rounded-[.65rem] border border-[var(--line)] bg-white px-3 py-2.5 text-sm leading-6 outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5 disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />;
}
