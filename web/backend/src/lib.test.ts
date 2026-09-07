import { describe, expect, it } from 'vitest';
import { buildTaggedMail, normalizeRemark, randomDelay } from './lib';
import { feedbackDisplayState, referencedVariables, renderContent, unknownVariables } from './content';

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

describe('P2 内容渲染', () => {
  const variables = [{ id: 'v1', name: 'product', displayName: '产品', mode: 'SEQUENCE' as const, version: 1, values: ['A', 'B'] }];

  it('识别变量并阻止未知变量', () => {
    expect(referencedVariables('{{friend_name}}：{{product}} / {{product}}')).toEqual(['friend_name', 'product']);
    expect(unknownVariables('{{missing}}', variables)).toEqual(['missing']);
  });

  it('顺序变量从第一项开始且同一消息重复引用一致', () => {
    const first = renderContent({ template: '{{product}}', variables, friendRemark: '客户一', scheduledAt: new Date('2026-09-08T01:30:00Z'), timezone: 'Asia/Shanghai', seed: 'seed', recipientOrder: 0 });
    const rendered = renderContent({ template: '{{friend_name}}：{{product}}+{{product}}', variables, friendRemark: '客户', salutation: '王总', scheduledAt: new Date('2026-09-08T01:30:00Z'), timezone: 'Asia/Shanghai', seed: 'seed', recipientOrder: 1 });
    expect(first.content).toBe('A');
    expect(rendered.content).toBe('王总：B+B');
  });

  it('随机变量在相同种子和收件顺序下可复现', () => {
    const randomVariables = [{ ...variables[0], mode: 'RANDOM' as const }];
    const input = { template: '{{product}}', variables: randomVariables, friendRemark: '客户', scheduledAt: new Date('2026-09-08T01:30:00Z'), timezone: 'Asia/Shanghai', seed: 'same-seed', recipientOrder: 3 };
    expect(renderContent(input).content).toBe(renderContent(input).content);
  });

  it('一分钟未反馈显示超时，迟到反馈仍可覆盖', () => {
    const acceptedAt = new Date('2026-09-08T00:00:00Z');
    expect(feedbackDisplayState({ acceptedAt, now: new Date('2026-09-08T00:01:00Z') })).toBe('TIMEOUT');
    expect(feedbackDisplayState({ acceptedAt, feedbackStatus: 'SUCCESS', now: new Date('2026-09-08T00:02:00Z') })).toBe('SUCCESS');
  });
});
