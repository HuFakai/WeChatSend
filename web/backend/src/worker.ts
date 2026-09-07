import './load-env';
import { AttemptStatus, MessageStatus, PrismaClient, TaskMessage, TaskStatus } from '@prisma/client';
import { DelayedError, Job, Worker } from 'bullmq';
import { config } from './config';
import { buildTaggedMail, randomDelay } from './lib';
import { MailService } from './mail.service';
import { MAIL_QUEUE, closeQueueConnections, mailQueue, redisConnection } from './queue';

const prisma = new PrismaClient();
const mail = new MailService();
const TRANSIENT_DATABASE_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024']);
const DISPATCH_LOCK_MS = 120_000;
let reconnecting: Promise<void> | undefined;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
}

async function reconnectDatabase() {
  if (!reconnecting) {
    reconnecting = (async () => {
      await prisma.$disconnect().catch(() => undefined);
      await sleep(250);
      await prisma.$connect();
    })().finally(() => {
      reconnecting = undefined;
    });
  }
  await reconnecting;
}

async function withDatabaseRetry<T>(operation: () => Promise<T>, retries = 1): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const code = errorCode(error);
      if (!TRANSIENT_DATABASE_CODES.has(code) || attempt >= retries) throw error;
      if (code === 'P1017' || code === 'P1001' || code === 'P1002') {
        await reconnectDatabase();
      } else {
        await sleep(300 * (attempt + 1));
      }
    }
  }
}

async function publishOutbox() {
  const events = await prisma.outboxEvent.findMany({
    where: { processedAt: null, type: 'TASK_MESSAGE_READY' },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  for (const event of events) {
    const payload = event.payload as { messageId: string; readyAt: string };
    const delay = Math.max(0, new Date(payload.readyAt).getTime() - Date.now());
    await mailQueue().add('send', { messageId: payload.messageId }, {
      jobId: payload.messageId,
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    await prisma.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  }
}

type DispatchDecision =
  | { kind: 'acquired'; message: TaskMessage }
  | { kind: 'delayed'; timestamp: number; message: TaskMessage }
  | { kind: 'skip'; message: TaskMessage };

async function acquireDispatch(messageId: string): Promise<DispatchDecision | undefined> {
  const initial = await prisma.taskMessage.findUnique({ where: { id: messageId } });
  if (!initial) return undefined;
  if (!['PENDING', 'RETRY_WAIT'].includes(initial.status)) return { kind: 'skip', message: initial };

  await prisma.accountDispatchState.createMany({
    data: [{ accountId: initial.accountId, nextAllowedAt: new Date() }],
    skipDuplicates: true,
  });

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT account_id FROM account_dispatch_states WHERE account_id = ${initial.accountId}::uuid FOR UPDATE`;
    const [message, state] = await Promise.all([
      tx.taskMessage.findUniqueOrThrow({ where: { id: messageId } }),
      tx.accountDispatchState.findUniqueOrThrow({ where: { accountId: initial.accountId } }),
    ]);
    if (!['PENDING', 'RETRY_WAIT'].includes(message.status)) return { kind: 'skip', message } as const;

    const now = Date.now();
    const anotherMessageOwnsLock = state.lockedMessageId && state.lockedMessageId !== message.id;
    const lockBlocksUntil = anotherMessageOwnsLock && state.lockedUntil && state.lockedUntil.getTime() > now
      ? Math.min(state.lockedUntil.getTime(), now + 1000)
      : 0;
    const timestamp = Math.max(message.readyAt.getTime(), state.nextAllowedAt.getTime(), lockBlocksUntil);
    if (timestamp > now) return { kind: 'delayed', timestamp, message } as const;

    await tx.accountDispatchState.update({
      where: { accountId: message.accountId },
      data: {
        lockedMessageId: message.id,
        lockedUntil: new Date(now + DISPATCH_LOCK_MS),
      },
    });
    const reserved = await tx.taskMessage.update({
      where: { id: message.id },
      data: { dispatchReservedAt: new Date(now) },
    });
    return { kind: 'acquired', message: reserved } as const;
  });
}

async function releaseDispatch(message: TaskMessage, attempted: boolean) {
  const data = attempted
    ? {
        lockedMessageId: null,
        lockedUntil: null,
        nextAllowedAt: new Date(Date.now() + randomDelay(message.minDelay, message.maxDelay) * 1000),
      }
    : { lockedMessageId: null, lockedUntil: null };
  await prisma.accountDispatchState.updateMany({
    where: { accountId: message.accountId, lockedMessageId: message.id },
    data,
  });
}

async function refreshTask(taskId: string) {
  const groups = await prisma.taskMessage.groupBy({
    by: ['status'],
    where: { taskId },
    _count: { _all: true },
  });
  const counts = new Map(groups.map((group) => [group.status, group._count._all]));
  const unfinished = ['PENDING', 'SENDING', 'RETRY_WAIT'].some(
    (state) => (counts.get(state as MessageStatus) ?? 0) > 0,
  );
  if (unfinished) {
    await prisma.task.update({ where: { id: taskId }, data: { status: TaskStatus.RUNNING } });
    return;
  }
  const accepted = counts.get('ACCEPTED') ?? 0;
  const total = groups.reduce((sum, group) => sum + group._count._all, 0);
  const cancelled = counts.get('CANCELLED') ?? 0;
  const status = accepted === total
    ? TaskStatus.COMPLETED
    : accepted > 0
      ? TaskStatus.PARTIAL
      : cancelled === total
        ? TaskStatus.CANCELLED
        : TaskStatus.FAILED;
  await prisma.task.update({ where: { id: taskId }, data: { status } });
}

async function processMessage(job: Job<{ messageId: string }>, token?: string) {
  const decision = await acquireDispatch(job.data.messageId);
  if (!decision) return;
  if (decision.kind === 'delayed') {
    if (!token) throw new Error('BullMQ 未提供任务锁令牌');
    await job.moveToDelayed(decision.timestamp, token);
    throw new DelayedError();
  }
  if (decision.kind === 'skip') {
    if (decision.message.status === 'SENDING') {
      await prisma.taskMessage.update({
        where: { id: decision.message.id },
        data: {
          status: 'UNKNOWN',
          errorCode: 'WORKER_RECOVERY_UNKNOWN',
          errorMessage: '上次发信在结果落库前中断，请核对微信或等待快捷指令反馈',
        },
      });
      await refreshTask(decision.message.taskId);
    }
    // A previous run may have persisted the SMTP result and then lost its DB
    // connection while releasing the account lease. This is idempotent.
    await releaseDispatch(decision.message, true);
    return;
  }

  let message = decision.message;
  let attempted = false;
  try {
    message = await prisma.taskMessage.findUniqueOrThrow({ where: { id: message.id } });
    const [task, account, friend] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: message.taskId } }),
      prisma.wechatAccount.findUniqueOrThrow({ where: { id: message.accountId } }),
      prisma.friend.findUniqueOrThrow({ where: { id: message.friendId } }),
    ]);
    if (task.status === 'CANCELLED') {
      await prisma.taskMessage.update({ where: { id: message.id }, data: { status: 'CANCELLED' } });
      return;
    }
    if (account.status !== 'ACTIVE' || account.configVersion !== message.configVersion) {
      await prisma.taskMessage.update({
        where: { id: message.id },
        data: { status: 'NEEDS_REVIEW', errorCode: 'ACCOUNT_CONFIG_CHANGED', errorMessage: '发送账号配置已变更' },
      });
      return;
    }
    if (friend.status !== 'ACTIVE' || friend.remark !== message.friendRemark) {
      await prisma.taskMessage.update({
        where: { id: message.id },
        data: { status: 'SKIPPED', errorCode: 'FRIEND_CHANGED', errorMessage: '好友已停用或备注已变更' },
      });
      return;
    }

    const sequence = await prisma.deliveryAttempt.count({ where: { messageId: message.id } }) + 1;
    const attempt = await prisma.$transaction(async (tx) => {
      await tx.taskMessage.update({ where: { id: message.id }, data: { status: MessageStatus.SENDING } });
      return tx.deliveryAttempt.create({ data: { messageId: message.id, sequence } });
    });
    attempted = true;

    let info;
    try {
      info = await mail.send({
        to: message.recipientEmail,
        subject: message.subject,
        messageId: message.messageId,
        text: buildTaggedMail({
          taskId: message.messageId,
          batchId: message.taskId,
          messageId: message.messageId,
          user: message.friendRemark,
          message: message.content,
        }),
      });
      if (!info.accepted?.length) {
        const rejected = new Error('SMTP 未接受收件地址') as Error & { responseCode?: number; code?: string };
        rejected.responseCode = 550;
        rejected.code = 'SMTP_RECIPIENT_REJECTED';
        throw rejected;
      }
    } catch (error) {
      const failure = error as Error & { responseCode?: number; code?: string; command?: string };
      const safeMessage = failure.message.slice(0, 500);
      const safeConnectionFailure = ['CONN', 'AUTH'].includes(failure.command ?? '')
        && ['ECONNECTION', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'EAUTH'].includes(failure.code ?? '');
      if (failure.responseCode && failure.responseCode >= 500) {
        await prisma.$transaction([
          prisma.deliveryAttempt.update({ where: { id: attempt.id }, data: {
            status: AttemptStatus.FAILED, errorCode: failure.code, errorMessage: safeMessage, completedAt: new Date(),
          } }),
          prisma.taskMessage.update({ where: { id: message.id }, data: {
            status: MessageStatus.FAILED, errorCode: failure.code, errorMessage: safeMessage,
          } }),
        ]);
      } else if (((failure.responseCode && failure.responseCode >= 400) || safeConnectionFailure) && job.attemptsMade < 2) {
        await prisma.$transaction([
          prisma.deliveryAttempt.update({ where: { id: attempt.id }, data: {
            status: AttemptStatus.FAILED, errorCode: failure.code, errorMessage: safeMessage, completedAt: new Date(),
          } }),
          prisma.taskMessage.update({ where: { id: message.id }, data: {
            status: MessageStatus.RETRY_WAIT, errorCode: failure.code, errorMessage: safeMessage,
            dispatchReservedAt: null,
          } }),
        ]);
        throw error;
      } else if (safeConnectionFailure) {
        await prisma.$transaction([
          prisma.deliveryAttempt.update({ where: { id: attempt.id }, data: {
            status: AttemptStatus.FAILED, errorCode: failure.code, errorMessage: safeMessage, completedAt: new Date(),
          } }),
          prisma.taskMessage.update({ where: { id: message.id }, data: {
            status: MessageStatus.FAILED, errorCode: failure.code, errorMessage: safeMessage,
          } }),
        ]);
      } else {
        await prisma.$transaction([
          prisma.deliveryAttempt.update({ where: { id: attempt.id }, data: {
            status: AttemptStatus.UNKNOWN, errorCode: failure.code, errorMessage: safeMessage, completedAt: new Date(),
          } }),
          prisma.taskMessage.update({ where: { id: message.id }, data: {
            status: MessageStatus.UNKNOWN, errorCode: failure.code, errorMessage: safeMessage,
          } }),
        ]);
      }
      return;
    }

    const acceptedAt = new Date();
    await prisma.$transaction([
      prisma.deliveryAttempt.update({
        where: { id: attempt.id },
        data: { status: AttemptStatus.ACCEPTED, providerMessageId: info.messageId, completedAt: acceptedAt },
      }),
      prisma.taskMessage.update({
        where: { id: message.id },
        data: { status: MessageStatus.ACCEPTED, acceptedAt, errorCode: null, errorMessage: null },
      }),
    ]);
  } finally {
    await releaseDispatch(message, attempted);
    await refreshTask(message.taskId);
  }
}

const worker = new Worker(
  MAIL_QUEUE,
  (job, token) => withDatabaseRetry(() => processMessage(job, token)),
  { connection: redisConnection(), concurrency: config().WORKER_CONCURRENCY },
);
worker.on('failed', (job, error) => console.error('mail job failed', job?.id, error.message));

let publishingOutbox = false;
let outboxFailureCount = 0;
async function runOutbox() {
  if (publishingOutbox) return;
  publishingOutbox = true;
  try {
    await withDatabaseRetry(publishOutbox);
    outboxFailureCount = 0;
  } catch (error) {
    outboxFailureCount += 1;
    if (outboxFailureCount === 1 || outboxFailureCount % 10 === 0) {
      console.error('outbox failed', error instanceof Error ? error.message : error);
    }
  } finally {
    publishingOutbox = false;
  }
}

const outboxTimer = setInterval(() => void runOutbox(), 1000);
void runOutbox();

async function shutdown() {
  clearInterval(outboxTimer);
  await worker.close();
  await closeQueueConnections();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
