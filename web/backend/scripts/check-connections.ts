import '../src/load-env';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('缺少 REDIS_URL');

  const prisma = new PrismaClient();
  const redis = new IORedis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 0,
  });
  // ioredis 会额外通过 EventEmitter 报错；连接结果由下方 Promise 统一处理。
  redis.on('error', () => undefined);

  try {
    const [database, queue] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.connect().then(() => redis.ping()),
    ]);
    if (database.status === 'rejected') {
      throw new Error(`PostgreSQL 连接失败：${database.reason instanceof Error ? database.reason.message : database.reason}`);
    }
    if (queue.status === 'rejected' || queue.value !== 'PONG') {
      const reason = queue.status === 'rejected' ? queue.reason : queue.value;
      throw new Error(`Redis 连接失败：${reason instanceof Error ? reason.message : reason}`);
    }
    console.log('PostgreSQL: OK');
    console.log('Redis: OK');
  } finally {
    await redis.quit().catch(() => redis.disconnect());
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
