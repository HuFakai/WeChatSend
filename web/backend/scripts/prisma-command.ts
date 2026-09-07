import '../src/load-env';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('未找到 DATABASE_URL。请先在仓库根目录创建并填写 .env。');
  process.exit(1);
}

const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
