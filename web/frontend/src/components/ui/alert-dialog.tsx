import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export function AlertDialogOverlay({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return <AlertDialogPrimitive.Overlay className={cn('fixed inset-0 bg-neutral-950/50 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in', className)} {...props} />;
}

export function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return <AlertDialogPortal><AlertDialogOverlay /><AlertDialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-5 rounded-2xl border border-neutral-300 bg-white p-6 shadow-2xl outline-none', className)} {...props} /></AlertDialogPortal>;
}

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn('text-lg font-semibold tracking-tight text-neutral-950', className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn('text-sm leading-6 text-neutral-500', className)} {...props} />;
}

export function AlertDialogAction({ className, variant = 'default', ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Action> & Pick<React.ComponentProps<typeof Button>, 'variant'>) {
  return <Button variant={variant} asChild><AlertDialogPrimitive.Action className={className} {...props} /></Button>;
}

export function AlertDialogCancel({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <Button variant="outline" asChild><AlertDialogPrimitive.Cancel className={className} {...props} /></Button>;
}
