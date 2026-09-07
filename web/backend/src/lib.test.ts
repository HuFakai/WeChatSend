import { describe, expect, it } from 'vitest';
import { buildTaggedMail, normalizeRemark, randomDelay } from './lib';

describe('标签邮件协议', () => {
  it('生成快捷指令可匹配的独立标签行', () => {
    const taskId = '8d1ae78a-95aa-4458-ab82-f3eb085e3547';
    const mail = buildTaggedMail({ taskId, batchId: 'batch-1', messageId: taskId, user: '凯旋', message: '第一行\n第二行' });
    expect(mail).toBe(
      `[VERSION]1\n[TASK_ID]${taskId}\n[BATCH_ID]batch-1\n[MESSAGE_ID]${taskId}\n[USER]\n凯旋\n[/USER]\n[MESSAGE]\n第一行\n第二行\n[/MESSAGE]`,
    );
    expect(mail.match(/\[USER\]\s*(.*?)\s*\[\/USER\]/s)?.[1]).toBe('凯旋');
    expect(mail.match(/\[MESSAGE\]\s*(.*?)\s*\[\/MESSAGE\]/s)?.[1]).toBe('第一行\n第二行');
    expect(mail.match(/\[TASK_ID\]([0-9a-fA-F-]{36})/)?.[1]).toBe(taskId);
    const crlfMail = mail.replaceAll('\n', '\r\n');
    expect(crlfMail.match(/\[USER\]\s*(.*?)\s*\[\/USER\]/s)?.[1]).toBe('凯旋');
    expect(crlfMail.match(/\[MESSAGE\]\s*(.*?)\s*\[\/MESSAGE\]/s)?.[1]).toBe('第一行\r\n第二行');
  });

  it('只规范化 Unicode 与首尾空白', () => {
    expect(normalizeRemark('  A  客户  ')).toBe('A  客户');
  });

  it('随机间隔包含边界', () => {
    for (let i = 0; i < 100; i += 1) expect(randomDelay(10, 15)).toBeGreaterThanOrEqual(10);
  });
});
