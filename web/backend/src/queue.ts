import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from './config';

export const MAIL_QUEUE = 'mail-dispatch';

let connection: IORedis | undefined;
let queue: Queue | undefined;

export function redisConnection() {
  connection ??= new IORedis(config().REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

export function mailQueue() {
  queue ??= new Queue(MAIL_QUEUE, { connection: redisConnection() });
  return queue;
}

export async function closeQueueConnections() {
  await queue?.close();
  await connection?.quit();
}
