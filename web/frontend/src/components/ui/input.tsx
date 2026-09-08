import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-neutral-100', className)} {...props} />;
}
