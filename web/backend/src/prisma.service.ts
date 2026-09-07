import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const TRANSIENT_DATABASE_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024']);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private reconnecting?: Promise<void>;

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Remote PostgreSQL can close an idle TCP connection without notice. Retry one
   * read/write operation after rebuilding Prisma's pool so a brief disconnect does
   * not turn into a user-visible 500 response.
   */
  async resilient<T>(operation: () => Promise<T>, retries = 1): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
        if (!TRANSIENT_DATABASE_CODES.has(code) || attempt >= retries) throw error;

        if (code === 'P1017' || code === 'P1001' || code === 'P1002') {
          await this.reconnect();
        } else {
          await delay(300 * (attempt + 1));
        }
      }
    }
  }

  private async reconnect() {
    if (!this.reconnecting) {
      this.reconnecting = (async () => {
        await this.$disconnect().catch(() => undefined);
        await delay(250);
        await this.$connect();
      })().finally(() => {
        this.reconnecting = undefined;
      });
    }
    await this.reconnecting;
  }
}
