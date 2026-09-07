import { post, request } from '../../services/api';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

Page({
  data: {
    title: '',
    content: '',
    selections: [] as any[],
    total: 0,
    timing: 'now',
    date: '',
    time: '',
    busy: false,
    error: '',
  },
  onLoad() {
    const now = new Date();
    this.setData({
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    });
    void this.init();
  },
  async init() {
    try {
      const accounts = (await request<any[]>('/accounts')).filter((account) => account.status === 'ACTIVE');
      const selections = await Promise.all(accounts.map(async (account) => ({
        ...account,
        friends: (await request<any[]>(`/accounts/${account.id}/friends`))
          .filter((friend) => friend.status === 'ACTIVE')
          .map((friend) => ({ ...friend, selected: false })),
        selectedCount: 0,
      })));
      this.setData({ selections });
    } catch (error) {
      this.setData({ error: (error as Error).message });
    }
  },
  titleInput(event: any) {
    this.setData({ title: event.detail.value });
  },
  contentInput(event: any) {
    this.setData({ content: event.detail.value });
  },
  toggleFriend(event: any) {
    const accountIndex = event.currentTarget.dataset.accountIndex;
    const friendIndex = event.currentTarget.dataset.friendIndex;
    const key = `selections[${accountIndex}].friends[${friendIndex}].selected`;
    const selected = !this.data.selections[accountIndex].friends[friendIndex].selected;
    const count = this.data.selections[accountIndex].selectedCount + (selected ? 1 : -1);
    this.setData({
      [key]: selected,
      [`selections[${accountIndex}].selectedCount`]: count,
      total: this.data.total + (selected ? 1 : -1),
    });
  },
  delayInput(event: any) {
    this.setData({
      [`selections[${event.currentTarget.dataset.accountIndex}].${event.currentTarget.dataset.key}`]:
        Number(event.detail.value),
    });
  },
  timingChange(event: any) {
    const timing = event.currentTarget.dataset.value;
    if (timing === 'later') {
      const now = new Date();
      this.setData({
        timing,
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      });
      return;
    }
    this.setData({ timing });
  },
  dateChange(event: any) {
    this.setData({ date: event.detail.value });
  },
  timeChange(event: any) {
    this.setData({ time: event.detail.value });
  },
  async submit() {
    if (!this.data.title.trim() || !this.data.content.trim()) {
      return this.setData({ error: '请填写任务名称和消息内容' });
    }
    if (!this.data.total) return this.setData({ error: '请至少选择一位好友' });
    const invalidDelay = this.data.selections.some((selection) => selection.selectedCount
      && (selection.minDelay < 10 || selection.maxDelay < 10 || selection.minDelay > selection.maxDelay));
    if (invalidDelay) return this.setData({ error: '发送间隔至少 10 秒，且最小值不能大于最大值' });

    this.setData({ busy: true, error: '' });
    try {
      const body: any = {
        title: this.data.title,
        content: this.data.content,
        idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        selections: this.data.selections
          .filter((selection) => selection.selectedCount)
          .map((selection) => ({
            accountId: selection.id,
            friendIds: selection.friends.filter((friend: any) => friend.selected).map((friend: any) => friend.id),
            minDelay: Number(selection.minDelay),
            maxDelay: Number(selection.maxDelay),
          })),
      };
      if (this.data.timing === 'later') {
        body.scheduledAt = new Date(`${this.data.date}T${this.data.time}:00+08:00`).toISOString();
      }
      const task = await post<any>('/tasks', body);
      wx.redirectTo({ url: `/pages/task-detail/index?id=${task.id}` });
    } catch (error) {
      this.setData({ error: (error as Error).message });
    } finally {
      this.setData({ busy: false });
    }
  },
});
