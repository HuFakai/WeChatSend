import { describe, expect, it } from 'vitest';
import { buildTaggedMail, normalizeRemark, randomDelay } from './lib';

describe('标签邮件协议', () => {
  it('生成快捷指令可匹配的独立标签行', () => {
    expect(buildTaggedMail({ taskId: 'message-1', batchId: 'batch-1', messageId: 'message-1', user: '凯旋', message: '第一行\n第二行' })).toBe(
      '[VERSION]1\n[TASK_ID]message-1\n[BATCH_ID]batch-1\n[MESSAGE_ID]message-1\n[USER]\n凯旋\n[/USER]\n[MESSAGE]\n第一行\n第二行\n[/MESSAGE]',
    );
  });

  it('只规范化 Unicode 与首尾空白', () => {
    expect(normalizeRemark('  A  客户  ')).toBe('A  客户');
  });

  it('随机间隔包含边界', () => {
    for (let i = 0; i < 100; i += 1) expect(randomDelay(10, 15)).toBeGreaterThanOrEqual(10);
  });
});
