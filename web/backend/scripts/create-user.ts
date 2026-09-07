import '../src/load-env';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const username = argument('username')?.trim();
  const password = argument('password');
  if (!username || !password || password.length < 8) {
    throw new Error('用法：npm run user:create -- --username <账号> --password <至少8位密码>');
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { username },
      create: { username, passwordHash: await hash(password, 12) },
      update: { passwordHash: await hash(password, 12), status: 'ACTIVE' },
    });
    console.log(`已创建或更新内测账号：${user.username}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
