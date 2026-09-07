import { createHash } from 'node:crypto';

export const BUILT_IN_VARIABLES = ['date', 'time', 'weekday', 'friend_name'] as const;
const BUILT_INS = new Set<string>(BUILT_IN_VARIABLES);
const TOKEN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export type FrozenVariable = {
  id: string;
  name: string;
  displayName: string;
  mode: 'FIXED' | 'RANDOM' | 'SEQUENCE';
  version: number;
  values: string[];
};

export function referencedVariables(template: string) {
  return [...new Set([...template.matchAll(TOKEN)].map((match) => match[1]))];
}

function stableIndex(seed: string, name: string, order: number, size: number) {
  const bytes = createHash('sha256').update(`${seed}:${name}:${order}`).digest();
  return bytes.readUInt32BE(0) % size;
}

function dateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function renderContent(input: {
  template: string;
  variables: FrozenVariable[];
  friendRemark: string;
  salutation?: string | null;
  scheduledAt: Date;
  timezone: string;
  seed: string;
  recipientOrder: number;
}) {
  const parts = dateParts(input.scheduledAt, input.timezone);
  const custom = new Map(input.variables.map((variable) => [variable.name, variable]));
  const resolved = new Map<string, string>();
  const builtIn: Record<string, string> = {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
    friend_name: input.salutation?.trim() || input.friendRemark,
  };

  const content = input.template.replace(TOKEN, (_token, name: string) => {
    if (BUILT_INS.has(name)) return builtIn[name];
    if (resolved.has(name)) return resolved.get(name)!;
    const variable = custom.get(name);
    if (!variable?.values.length) throw new Error(`变量 {{${name}}} 不存在或没有候选值`);
    const index = variable.mode === 'FIXED'
      ? 0
      : variable.mode === 'SEQUENCE'
        ? input.recipientOrder % variable.values.length
        : stableIndex(input.seed, name, input.recipientOrder, variable.values.length);
    const value = variable.values[index];
    resolved.set(name, value);
    return value;
  });
  return { content, resolved: Object.fromEntries(resolved) };
}

export function unknownVariables(template: string, variables: FrozenVariable[]) {
  const custom = new Set(variables.map((item) => item.name));
  return referencedVariables(template).filter((name) => !BUILT_INS.has(name) && !custom.has(name));
}

export type FeedbackDisplayState = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'PENDING' | 'NOT_SENT';

export function feedbackDisplayState(input: {
  acceptedAt?: Date | string | null;
  feedbackStatus?: 'SUCCESS' | 'FAILED' | null;
  now?: Date;
  timeoutMs?: number;
}): FeedbackDisplayState {
  if (input.feedbackStatus) return input.feedbackStatus;
  if (!input.acceptedAt) return 'NOT_SENT';
  const deadline = new Date(input.acceptedAt).getTime() + (input.timeoutMs ?? 60_000);
  return (input.now ?? new Date()).getTime() >= deadline ? 'TIMEOUT' : 'PENDING';
}
