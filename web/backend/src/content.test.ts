import { describe, expect, it } from 'vitest';
import { renderContent, unknownVariables } from './content';

describe('content renderer', () => {
  const base = { scheduledAt: new Date('2026-09-08T02:03:04.000Z'), timezone: 'Asia/Shanghai', friendRemark: '客户A', seed: 'stable-seed', recipientOrder: 0 };

  it('renders dynamic built-ins deterministically', () => {
    const first = renderContent({ ...base, template: '{{friend_name}} {{date}} {{random_quote}} {{warm_greeting}}', variables: [] }).content;
    const second = renderContent({ ...base, template: '{{friend_name}} {{date}} {{random_quote}} {{warm_greeting}}', variables: [] }).content;
    expect(first).toBe(second);
    expect(first).toContain('客户A');
    expect(first).toContain('2026-09-08');
  });

  it('rejects only variables not provided by the snapshot', () => {
    expect(unknownVariables('x {{product}} {{date}}', [])).toEqual(['product']);
    expect(unknownVariables('x {{product}}', [{ id: '1', name: 'product', displayName: '产品', mode: 'FIXED', version: 1, values: ['A'] }])).toEqual([]);
  });
});
