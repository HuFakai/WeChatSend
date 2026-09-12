import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-3 focus:ring-neutral-950/8 disabled:bg-neutral-100', className)} {...props} />;
}
