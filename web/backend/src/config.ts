import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  API_PORT: z.coerce.number().int().positive().default(3100),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z.string().default('true').transform((value) => value === 'true'),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().optional(),
  SMTP_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(5).default(1),
  SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  SMTP_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  DEFAULT_TRIGGER_SUBJECT: z.string().default('WeChatSend'),
  VERIFY_SUBJECT: z.string().default('WeChatSend 邮箱验证（请勿触发快捷指令）'),
  APP_ENCRYPTION_KEY: z.string().min(32).optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  WECHAT_MINI_APPID: z.string().min(1).optional(),
  WECHAT_MINI_SECRET: z.string().min(1).optional(),
  WECHAT_MINI_ENV_VERSION: z.enum(['develop', 'trial', 'release']).default('release'),
  WECHAT_PAY_MCH_ID: z.string().min(1).optional(),
  WECHAT_PAY_SERIAL_NO: z.string().min(1).optional(),
  WECHAT_PAY_PRIVATE_KEY: z.string().min(1).optional(),
  WECHAT_PAY_API_V3_KEY: z.string().length(32).optional(),
  WECHAT_PAY_PLATFORM_CERT: z.string().min(1).optional(),
  WECHAT_PAY_NOTIFY_URL: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function config(): AppConfig {
  cached ??= schema.parse(process.env);
  return cached;
}
