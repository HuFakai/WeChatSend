import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-5', className)} {...props} />;
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-neutral-200 bg-white p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-neutral-500 outline-none transition-colors hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-950 data-[state=active]:bg-neutral-950 data-[state=active]:text-white', className)} {...props} />;
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('outline-none focus-visible:ring-2 focus-visible:ring-neutral-950', className)} {...props} />;
}
