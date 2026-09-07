import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// 支持从仓库根目录或 backend 目录单独启动。
loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ],
  quiet: true,
});

// API、Worker 和管理脚本是独立进程。为避免它们各自按 CPU 数量创建过大的
// Prisma 连接池，这里统一给 DATABASE_URL 补充保守的连接池参数。
if (process.env.DATABASE_URL) {
  try {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    if (!databaseUrl.searchParams.has('connection_limit')) {
      databaseUrl.searchParams.set('connection_limit', process.env.DB_CONNECTION_LIMIT || '4');
    }
    if (!databaseUrl.searchParams.has('pool_timeout')) {
      databaseUrl.searchParams.set('pool_timeout', process.env.DB_POOL_TIMEOUT || '20');
    }
    process.env.DATABASE_URL = databaseUrl.toString();
  } catch {
    // Prisma 会对无效 DATABASE_URL 给出具体错误，这里不吞掉或改写该错误。
  }
}
