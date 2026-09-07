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
  const role = (argument('role') || (username === 'admin' ? 'ADMIN' : 'USER')).toUpperCase();
  if (!username || !password || password.length < 8 || !['USER', 'ADMIN'].includes(role)) {
    throw new Error('用法：npm run user:create -- --username <账号> --password <至少8位密码> [--role USER|ADMIN]');
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { username },
      create: { username, passwordHash: await hash(password, 12), role: role as 'USER' | 'ADMIN' },
      update: { passwordHash: await hash(password, 12), role: role as 'USER' | 'ADMIN', status: 'ACTIVE' },
    });
    console.log(`已创建或更新内测账号：${user.username}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
