import type { Account, CustomVariable, Friend, MessageTemplate, Segment } from '@/types';

export type Timing = 'now' | 'later';
export type Selection = { account: Account; friends: Friend[]; groups: Segment[]; tags: Segment[]; selected: Set<string>; minDelay: number; maxDelay: number };
export type ScheduleWindow = { accountId: string; accountName: string; taskId: string | null; taskTitle: string | null; startAt: string; endAt: string; recipientCount: number; maxDelay: number };
export type ScheduleAvailability = { available: boolean; planned: ScheduleWindow[]; occupied: ScheduleWindow[]; conflicts: Array<{ planned: ScheduleWindow; occupied: ScheduleWindow }> };
export type Preview = { renderSeed: string; previewFingerprint: string; recipients: Array<{ friendRemark: string; content: string }>; schedule: ScheduleAvailability };
export type TaskPayload = { title: string; content: string; templateId: string | null; renderSeed: string; scheduledAt?: string; selections: Array<{ accountId: string; friendIds: string[]; groupIds: string[]; tagIds: string[]; minDelay: number; maxDelay: number }> };
export type BuilderReferenceData = { accounts: Account[]; templates: MessageTemplate[]; variables: CustomVariable[] };

export const builtInVariables = [
  { name: 'friend_name', label: '好友称呼' },
  { name: 'date', label: '日期' },
  { name: 'time', label: '时间' },
  { name: 'weekday', label: '星期' },
  { name: 'random_quote', label: '随机语录' },
  { name: 'warm_greeting', label: '温馨问候' },
];

export function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 19);
}
