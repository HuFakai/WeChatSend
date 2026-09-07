import { post, request } from '../../services/api';

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

Page({
  data: {
    id: '',
    task: null as any,
    accepted: 0,
    feedbackSuccess: 0,
    error: '',
    statusText: {
      SCHEDULED: '等待定时',
      RUNNING: '处理中',
      COMPLETED: '处理完成',
      PARTIAL: '部分完成',
      FAILED: '处理失败',
      CANCELLED: '已取消',
    } as Record<string, string>,
    messageText: {
      PENDING: '待处理',
      SENDING: '邮件发送中',
      ACCEPTED: '邮件已发送',
      RETRY_WAIT: '等待重试',
      FAILED: '发送失败',
      UNKNOWN: '结果待核实',
      NEEDS_REVIEW: '配置待复核',
      CANCELLED: '已取消',
      SKIPPED: '已跳过',
    } as Record<string, string>,
  },
  onLoad(options: any) {
    this.setData({ id: options.id });
    void this.load();
  },
  onShow() {
    if (this.data.id) void this.load();
  },
  async load() {
    try {
      const task = await request<any>(`/tasks/${this.data.id}`);
      task.scheduledAtText = formatTime(task.scheduledAt);
      task.messages = task.messages.map((message: any) => {
        const latestAttempt = message.attempts?.[message.attempts.length - 1];
        return {
          ...message,
          readyAtText: formatTime(message.readyAt),
          mailStartedAtText: formatTime(latestAttempt?.startedAt),
          acceptedAtText: formatTime(message.acceptedAt),
          feedbackReceivedAtText: formatTime(message.feedbackReceivedAt),
          feedbackText: message.feedbackStatus === 'SUCCESS'
            ? '微信发送成功'
            : message.feedbackStatus === 'FAILED'
              ? '微信发送失败'
              : '等待微信反馈',
        };
      });
      this.setData({
        task,
        accepted: task.messages.filter((message: any) => message.status === 'ACCEPTED').length,
        feedbackSuccess: task.messages.filter((message: any) => message.feedbackStatus === 'SUCCESS').length,
      });
    } catch (error) {
      this.setData({ error: (error as Error).message });
    }
  },
  cancel() {
    wx.showModal({
      title: '取消剩余邮件？',
      content: '已经发出的邮件无法撤回。',
      success: async (result) => {
        if (result.confirm) {
          await post(`/tasks/${this.data.id}/cancel`);
          await this.load();
        }
      },
    });
  },
  resend(event: any) {
    const messageId = event.currentTarget.dataset.id;
    const name = event.currentTarget.dataset.name;
    wx.showModal({
      title: `重新发送给“${name}”？`,
      content: '当前结果无法完全确认，重新发送可能造成重复。请先在微信中核对。',
      confirmText: '仍要重发',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          const task = await post<any>(`/tasks/${this.data.id}/messages/${messageId}/resend`, {
            idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          });
          wx.redirectTo({ url: `/pages/task-detail/index?id=${task.id}` });
        } catch (error) {
          wx.showToast({ title: (error as Error).message, icon: 'none' });
        }
      },
    });
  },
});
