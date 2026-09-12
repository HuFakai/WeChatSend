import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDateTime, formatShortDateTime } from './format';
import { routeLabel } from './navigation';

describe('展示格式', () => {
  it('将分转换为金额，并安全处理空值和无效日期', () => {
    expect(formatCurrency(1990)).toBe('¥19.90');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('invalid')).toBe('—');
    expect(formatShortDateTime('invalid')).toBe('—');
  });

  it('所有时间格式均显示到秒', () => {
    const value = new Date(2026, 8, 12, 19, 4, 5);
    expect(formatDateTime(value)).toMatch(/19:04:05$/);
    expect(formatShortDateTime(value)).toMatch(/19:04:05$/);
  });
});

describe('路由标题', () => {
  it('优先匹配详情和管理子页面', () => {
    expect(routeLabel('/tasks/new')).toBe('创建发送任务');
    expect(routeLabel('/tasks/task-1')).toBe('任务详情');
    expect(routeLabel('/admin/payment')).toBe('支付与套餐配置');
    expect(routeLabel('/admin/orders')).toBe('全部交易订单');
  });

  it('未知页面使用产品名兜底', () => {
    expect(routeLabel('/unknown')).toBe('WeChatSend');
  });
});
