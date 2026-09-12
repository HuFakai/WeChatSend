import * as React from 'react';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const DialogRoot = DialogPrimitive.Root;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn('dialog-overlay fixed inset-0 z-50', className)} {...props} />;
}

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content className={cn('dialog-panel fixed bottom-0 left-1/2 z-50 flex max-h-[94vh] w-full max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-t-2xl border border-neutral-300 bg-white shadow-[0_24px_80px_rgba(23,23,22,.18)] outline-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl', className)} {...props}>
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950" aria-label="关闭">
        <X />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>;
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 border-b border-neutral-200 px-5 py-4 pr-16 sm:px-6 sm:py-5', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-xl font-semibold tracking-tight text-neutral-950', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm leading-6 text-neutral-500', className)} {...props} />;
}
