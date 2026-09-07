import { createHash, randomBytes } from 'node:crypto';

export function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function normalizeRemark(value: string) {
  return value.normalize('NFC').trim();
}

export function assertSafeTagValue(value: string) {
  if (/\[(?:VERSION|TASK_ID|BATCH_ID|MESSAGE_ID|USER|MESSAGE|\/USER|\/MESSAGE)\]/i.test(value)) {
    throw new Error('内容包含邮件协议保留标签');
  }
}

export function buildTaggedMail(input: {
  taskId: string;
  batchId?: string;
  messageId: string;
  user: string;
  message: string;
}) {
  return [
    '[VERSION]1',
    `[TASK_ID]${input.taskId}`,
    ...(input.batchId ? [`[BATCH_ID]${input.batchId}`] : []),
    `[MESSAGE_ID]${input.messageId}`,
    '[USER]',
    input.user,
    '[/USER]',
    '[MESSAGE]',
    input.message,
    '[/MESSAGE]',
  ].join('\n');
}

export function randomDelay(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
