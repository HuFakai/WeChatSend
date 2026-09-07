import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('合并冲突的 Tailwind 类名', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
