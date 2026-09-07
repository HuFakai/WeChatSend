import { Badge } from './ui/badge';

const labels: Record<string, string> = {
  DRAFT: '草稿', SCHEDULED: '等待定时', RUNNING: '处理中', COMPLETED: '处理完成',
  PARTIAL: '部分完成', FAILED: '处理失败', CANCELLED: '已取消', PENDING: '待处理', SENDING: '邮件发送中',
  ACCEPTED: '邮件已发送', RETRY_WAIT: '等待重试', UNKNOWN: '结果待核实',
  NEEDS_REVIEW: '配置待复核', SKIPPED: '已跳过', ACTIVE: '使用中', DISABLED: '已停用',
  FEEDBACK_SUCCESS: '微信发送成功', FEEDBACK_FAILED: '微信发送失败', FEEDBACK_PENDING: '等待微信反馈',
};

export function StatusBadge({ status }: { status: string }) {
  const danger = ['FAILED', 'UNKNOWN', 'NEEDS_REVIEW', 'FEEDBACK_FAILED'].includes(status);
  const success = ['ACCEPTED', 'COMPLETED', 'ACTIVE', 'FEEDBACK_SUCCESS'].includes(status);
  return <Badge className={danger ? 'border-red-200 bg-red-50 text-red-700' : success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : ''}>{labels[status] ?? status}</Badge>;
}
