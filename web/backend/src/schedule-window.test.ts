import { describe, expect, it } from 'vitest';
import { createScheduleWindow, scheduleWindowsOverlap } from './schedule-window';

const windowFor = (startAt: string, recipientCount = 10, maxDelay = 10, accountId = 'account-1') => createScheduleWindow({
  accountId,
  accountName: '测试账号',
  taskId: null,
  taskTitle: null,
  startAt: new Date(startAt),
  recipientCount,
  maxDelay,
});

describe('schedule window', () => {
  it('reserves one maximum delay slot for every recipient', () => {
    expect(windowFor('2026-09-12T06:00:00.000Z').endAt.toISOString()).toBe('2026-09-12T06:01:40.000Z');
  });

  it('detects overlap from either side and allows an exact boundary', () => {
    const occupied = windowFor('2026-09-12T06:00:00.000Z');
    expect(scheduleWindowsOverlap(windowFor('2026-09-12T05:59:30.000Z', 4), occupied)).toBe(true);
    expect(scheduleWindowsOverlap(windowFor('2026-09-12T06:01:30.000Z', 2), occupied)).toBe(true);
    expect(scheduleWindowsOverlap(windowFor('2026-09-12T06:01:40.000Z', 2), occupied)).toBe(false);
    expect(scheduleWindowsOverlap(windowFor('2026-09-12T06:00:30.000Z', 2, 10, 'account-2'), occupied)).toBe(false);
  });
});
