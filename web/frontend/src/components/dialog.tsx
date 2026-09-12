import type { ReactNode } from 'react';
import { DialogContent, DialogDescription, DialogHeader, DialogRoot, DialogTitle } from '@/components/ui/dialog';

export function Dialog({ open, onClose, title, description, children, className }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string }) {
  return <DialogRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className={className}>
      <DialogHeader><DialogTitle>{title}</DialogTitle>{description ? <DialogDescription>{description}</DialogDescription> : null}</DialogHeader>
      <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
    </DialogContent>
  </DialogRoot>;
}
