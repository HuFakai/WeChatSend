import type { ReactNode } from 'react';

export function FormField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return <label className="block">
    <span className="field-label">{label}{required ? <span aria-hidden="true" className="ml-1 text-red-600">*</span> : null}</span>
    {children}
    {hint ? <span className="field-help block">{hint}</span> : null}
  </label>;
}
