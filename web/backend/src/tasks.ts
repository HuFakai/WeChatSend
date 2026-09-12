import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageStatus, Prisma, TaskStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { feedbackDisplayState, FrozenVariable, referencedVariables, renderContent, unknownVariables } from './content';
import { assertSafeTagValue } from './lib';
import { PrismaService } from './prisma.service';
import { ExternalApiService } from './external-api';

const selectionSchema = z.object({
  accountId: z.string().uuid(),
  friendIds: z.array(z.string().uuid()).max(5000).default([]),
  groupIds: z.array(z.string().uuid()).max(500).default([]),
  tagIds: z.array(z.string().uuid()).max(500).default([]),
  minDelay: z.number().int().min(10).max(3600).optional(),
  maxDelay: z.number().int().min(10).max(3600).optional(),
}).refine((value) => value.friendIds.length + value.groupIds.length + value.tagIds.length > 0, '请至少选择好友、分组或标签');

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(100),
  content: z.string().min(1).max(10000),
  scheduledAt: z.string().datetime().optional(),
  templateId: z.string().uuid().optional().nullable(),
  renderSeed: z.string().min(8).max(100).optional(),
  previewFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  idempotencyKey: z.string().min(8).max(100),
  selections: z.array(selectionSchema).min(1).max(100),
});

export const previewTaskSchema = createTaskSchema.omit({ idempotencyKey: true });

export const resendSchema = z.object({ idempotencyKey: z.string().min(8).max(100) });
export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().default(''),
});

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService, private readonly externalApi: ExternalApiService) {}

  list(ownerId: string) {
    return this.prisma.task.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { messages: true } } },
    });
  }

  async listPage(ownerId: string, query: z.infer<typeof taskListQuerySchema>) {
    const where: Prisma.TaskWhereInput = {
      ownerId,
      ...(query.search ? { OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { messages: true } } },
      }),
      this.prisma.task.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async summary(ownerId: string) {
    const [accounts, friends, tasks, statuses] = await Promise.all([
      this.prisma.wechatAccount.count({ where: { ownerId, status: 'ACTIVE' } }),
      this.prisma.friend.count({ where: { ownerId, status: 'ACTIVE' } }),
      this.prisma.task.count({ where: { ownerId } }),
      this.prisma.taskMessage.groupBy({
        by: ['status'], where: { task: { ownerId } }, _count: { _all: true },
      }),
    ]);
    return { accounts, friends, tasks, messages: Object.fromEntries(statuses.map((s) => [s.status, s._count._all])) };
  }

  async detail(ownerId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, ownerId },
      include: {
        accountSettings: true,
        messages: { orderBy: { createdAt: 'asc' }, include: { attempts: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!task) throw new NotFoundException('任务不存在');
    const now = new Date();
    return {
      ...task,
      messages: task.messages.map((message) => ({
        ...message,
        feedbackState: feedbackDisplayState({ acceptedAt: message.acceptedAt, feedbackStatus: message.feedbackStatus, now }),
        feedbackDeadlineAt: message.acceptedAt ? new Date(message.acceptedAt.getTime() + 60_000) : null,
      })),
    };
  }

  async preview(
    ownerId: string,
    body: z.infer<typeof previewTaskSchema>,
  ) {
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    const prepared = await this.prepare(ownerId, body, scheduledAt, body.renderSeed ?? randomUUID());
    return {
      renderSeed: prepared.seed,
      previewFingerprint: this.fingerprint(prepared.seed, prepared.messageRows),
      recipients: prepared.messageRows.map((message) => ({
        accountId: message.accountId, friendId: message.friendId, friendRemark: message.friendRemark,
        recipientOrder: message.recipientOrder, content: message.content,
      })),
      variableSnapshot: prepared.variableSnapshot,
      templateSnapshot: prepared.templateSnapshot,
    };
  }

  async create(
    ownerId: string,
    body: z.infer<typeof createTaskSchema>,
  ) {
    const existing = await this.prisma.task.findUnique({
      where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: body.idempotencyKey } },
      select: { id: true },
    });
    if (existing) return this.detail(ownerId, existing.id);
    try {
      assertSafeTagValue(body.content);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    if (scheduledAt.getTime() < Date.now() - 60_000) throw new BadRequestException('定时时间不能早于当前时间');

    const taskId = randomUUID();
    const prepared = await this.prepare(ownerId, body, scheduledAt, body.renderSeed ?? taskId);
    if (body.previewFingerprint && body.previewFingerprint !== this.fingerprint(prepared.seed, prepared.messageRows)) {
      throw new BadRequestException('预览内容已变化，请重新预览后再提交');
    }
    const { selections, accountMap, messageRows, templateSnapshot, variableSnapshot, seed } = prepared;
    const now = new Date();
    const status: TaskStatus = scheduledAt > now ? 'SCHEDULED' : 'RUNNING';

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.task.create({
          data: {
            id: taskId, ownerId, title: body.title, content: body.content,
            contentTemplate: body.content, templateSnapshot, variableSnapshot, randomSeed: seed,
            scheduledAt, status, idempotencyKey: body.idempotencyKey,
          },
        });
        await this.reserveMembership(tx, ownerId, taskId, messageRows.length);
        await tx.taskAccountSetting.createMany({
          data: selections.map((selection) => {
            const account = accountMap.get(selection.accountId)!;
            return {
              taskId, accountId: account.id, recipientEmail: account.recipientEmail,
              subject: account.subject, configVersion: account.configVersion,
              minDelay: selection.minDelay ?? account.minDelay,
              maxDelay: selection.maxDelay ?? account.maxDelay,
            };
          }),
        });
        await tx.taskMessage.createMany({ data: messageRows.map((message) => ({ ...message, taskId })) });
        await tx.outboxEvent.createMany({
          data: messageRows.map((message) => ({
            type: 'TASK_MESSAGE_READY', aggregateId: message.id,
            payload: { messageId: message.id, readyAt: scheduledAt.toISOString() } as Prisma.InputJsonValue,
          })),
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.task.findUnique({
          where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: body.idempotencyKey } },
        });
        if (existing) return existing;
      }
      throw error;
    }
    return this.detail(ownerId, taskId);
  }

  async copy(ownerId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, ownerId },
      include: { accountSettings: true, messages: { orderBy: { recipientOrder: 'asc' } } },
    });
    if (!task) throw new NotFoundException('任务不存在');
    const settings = new Map(task.accountSettings.map((item) => [item.accountId, item]));
    const selections = [...new Set(task.messages.map((message) => message.accountId))].map((accountId) => ({
      accountId,
      friendIds: task.messages.filter((message) => message.accountId === accountId).map((message) => message.friendId),
      groupIds: [], tagIds: [],
      minDelay: settings.get(accountId)?.minDelay ?? 10,
      maxDelay: settings.get(accountId)?.maxDelay ?? 15,
    }));
    const content = task.contentTemplate ?? task.content;
    return this.prisma.taskDraft.create({ data: {
      ownerId,
      title: `副本：${task.title}`.slice(0, 100),
      content,
      sourceTaskId: task.id,
      payload: { selections, templateId: null, renderSeed: randomUUID() } as Prisma.InputJsonValue,
    } });
  }

  async cancel(ownerId: string, id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, ownerId } });
    if (!task) throw new NotFoundException('任务不存在');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tasks WHERE id=${id}::uuid FOR UPDATE`;
      const cancelled = await tx.taskMessage.updateMany({
        where: { taskId: id, status: { in: ['PENDING', 'RETRY_WAIT'] } },
        data: { status: MessageStatus.CANCELLED, errorCode: 'USER_CANCELLED', errorMessage: '用户取消' },
      });
      await tx.task.update({ where: { id }, data: { status: TaskStatus.CANCELLED } });
      await this.releaseMembership(tx, id, cancelled.count);
    });
    return { ok: true };
  }

  async resend(
    ownerId: string,
    taskId: string,
    messageId: string,
    body: z.infer<typeof resendSchema>,
  ) {
    const message = await this.prisma.taskMessage.findFirst({
      where: { id: messageId, taskId, task: { ownerId } },
      include: { task: true },
    });
    if (!message) throw new NotFoundException('邮件记录不存在');
    if (!['FAILED', 'UNKNOWN'].includes(message.status)) {
      throw new BadRequestException('只有发送失败或结果待核实的记录可以人工重发');
    }

    return this.create(ownerId, {
      title: `重发：${message.task.title}`.slice(0, 100),
      content: message.content,
      idempotencyKey: body.idempotencyKey,
      selections: [{
        accountId: message.accountId,
        friendIds: [message.friendId],
        groupIds: [],
        tagIds: [],
        minDelay: message.minDelay,
        maxDelay: message.maxDelay,
      }],
    });
  }

  private async reserveMembership(tx: Prisma.TransactionClient, userId: string, taskId: string, amount: number) {
    const required = await tx.featureFlag.findUnique({ where: { key: 'membership_required' } });
    if (!required?.enabled) return;
    await tx.$queryRaw`SELECT id FROM membership_grants WHERE user_id=${userId}::uuid AND expires_at > NOW() ORDER BY expires_at,id FOR UPDATE`;
    const grants = await tx.membershipGrant.findMany({ where: { userId, expiresAt: { gt: new Date() } }, orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }] });
    if (!grants.length) throw new BadRequestException('当前没有有效会员权益，请先购买套餐');
    const unlimited = grants.find((grant) => grant.quotaTotal === 0);
    if (unlimited) {
      await tx.membershipUsage.create({ data: { userId, taskId, grantId: unlimited.id, amount: 0 } });
      return;
    }
    const available = grants.reduce((sum, grant) => sum + Math.max(0, grant.quotaTotal - grant.quotaUsed), 0);
    if (available < amount) throw new BadRequestException(`剩余消息额度不足：需要 ${amount} 条，当前可用 ${available} 条`);
    let remaining = amount;
    for (const grant of grants) {
      const take = Math.min(remaining, Math.max(0, grant.quotaTotal - grant.quotaUsed));
      if (!take) continue;
      await tx.membershipGrant.update({ where: { id: grant.id }, data: { quotaUsed: { increment: take } } });
      await tx.membershipUsage.create({ data: { userId, taskId, grantId: grant.id, amount: take } });
      remaining -= take;
      if (!remaining) break;
    }
  }

  private async releaseMembership(tx: Prisma.TransactionClient, taskId: string, amount: number) {
    if (!amount) return;
    const usages = await tx.membershipUsage.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' } });
    let remaining = amount;
    for (const usage of usages) {
      const release = Math.min(remaining, usage.amount - usage.refunded);
      if (!release) continue;
      await tx.membershipGrant.update({ where: { id: usage.grantId }, data: { quotaUsed: { decrement: release } } });
      await tx.membershipUsage.update({ where: { id: usage.id }, data: { refunded: { increment: release } } });
      remaining -= release;
      if (!remaining) break;
    }
  }

  private async prepare(
    ownerId: string,
    body: z.infer<typeof previewTaskSchema>,
    scheduledAt: Date,
    seed: string,
  ) {
    try { assertSafeTagValue(body.content); } catch (error) { throw new BadRequestException((error as Error).message); }

    const deduped = new Map<string, z.infer<typeof selectionSchema>>();
    for (const selection of body.selections) {
      const current = deduped.get(selection.accountId);
      deduped.set(selection.accountId, {
        ...selection,
        friendIds: [...new Set([...(current?.friendIds ?? []), ...selection.friendIds])],
        groupIds: [...new Set([...(current?.groupIds ?? []), ...selection.groupIds])],
        tagIds: [...new Set([...(current?.tagIds ?? []), ...selection.tagIds])],
      });
    }
    const selections = [...deduped.values()];
    const accountIds = selections.map((selection) => selection.accountId);
    const [accounts, owner] = await Promise.all([
      this.prisma.wechatAccount.findMany({ where: { id: { in: accountIds }, ownerId, status: 'ACTIVE' } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { timezone: true } }),
    ]);
    if (accounts.length !== accountIds.length) throw new BadRequestException('包含不存在或已停用的发送账号');
    if (accounts.some((account) => !account.emailVerifiedAt)) throw new BadRequestException('请先完成所有发送账号的邮箱验证');
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const groupIds = [...new Set(selections.flatMap((selection) => selection.groupIds))];
    const tagIds = [...new Set(selections.flatMap((selection) => selection.tagIds))];
    const [groups, tags] = await Promise.all([
      this.prisma.friendGroup.findMany({ where: { id: { in: groupIds }, ownerId }, include: { members: { where: { friend: { status: 'ACTIVE' } }, orderBy: { friendId: 'asc' } } } }),
      this.prisma.friendTag.findMany({ where: { id: { in: tagIds }, ownerId }, include: { members: { where: { friend: { status: 'ACTIVE' } }, orderBy: { friendId: 'asc' } } } }),
    ]);
    if (groups.length !== groupIds.length || tags.length !== tagIds.length) throw new BadRequestException('包含不存在的好友分组或标签');
    const groupMap = new Map(groups.map((item) => [item.id, item]));
    const tagMap = new Map(tags.map((item) => [item.id, item]));
    for (const selection of selections) {
      const expanded = [...selection.friendIds];
      for (const id of selection.groupIds) {
        const group = groupMap.get(id)!;
        if (group.accountId !== selection.accountId) throw new BadRequestException('好友分组与发送账号不匹配');
        expanded.push(...group.members.map((member) => member.friendId));
      }
      for (const id of selection.tagIds) {
        const tag = tagMap.get(id)!;
        if (tag.accountId !== selection.accountId) throw new BadRequestException('好友标签与发送账号不匹配');
        expanded.push(...tag.members.map((member) => member.friendId));
      }
      selection.friendIds = [...new Set(expanded)];
      if (!selection.friendIds.length) throw new BadRequestException('选择的分组或标签中没有启用好友');
      if (selection.friendIds.length > 5000) throw new BadRequestException('单个发送账号一次最多展开 5000 位好友');
      const account = accountMap.get(selection.accountId)!;
      const min = selection.minDelay ?? account.minDelay;
      const max = selection.maxDelay ?? account.maxDelay;
      if (min < 10 || max < 10 || min > max) throw new BadRequestException('发送间隔至少 10 秒，且最小值不能大于最大值');
    }

    const allFriendIds = selections.flatMap((selection) => selection.friendIds);
    const friends = await this.prisma.friend.findMany({ where: { id: { in: allFriendIds }, ownerId, status: 'ACTIVE' } });
    const friendMap = new Map(friends.map((friend) => [friend.id, friend]));
    if (friendMap.size !== new Set(allFriendIds).size) throw new BadRequestException('包含不存在或已停用的好友');
    for (const selection of selections) {
      if (selection.friendIds.some((id) => friendMap.get(id)?.accountId !== selection.accountId)) throw new BadRequestException('好友与发送账号不匹配');
    }

    const names = referencedVariables(body.content);
    const variableRows = await this.prisma.customVariable.findMany({
      where: { ownerId, name: { in: names } },
      include: { values: { orderBy: { position: 'asc' } } },
    });
    const variables: FrozenVariable[] = variableRows.map((variable) => ({
      id: variable.id, name: variable.name, displayName: variable.displayName, mode: variable.mode,
      version: variable.version, values: variable.values.map((value) => value.value),
    }));
    const customNames = new Set(variables.map((variable) => variable.name));
    const externalVariables = await this.externalApi.resolveVariables(names.filter((name) => !customNames.has(name)));
    variables.push(...externalVariables);
    const unknown = unknownVariables(body.content, variables);
    if (unknown.length) throw new BadRequestException(`未知变量：${unknown.map((name) => `{{${name}}}`).join('、')}`);
    if (variables.some((variable) => !variable.values.length)) throw new BadRequestException('变量候选值不能为空');

    let templateSnapshot: Prisma.InputJsonValue | undefined;
    if (body.templateId) {
      const template = await this.prisma.messageTemplate.findFirst({ where: { id: body.templateId, isActive: true, OR: [{ scope: 'PLATFORM' }, { ownerId }] } });
      if (!template) throw new BadRequestException('所选模板不存在或已停用');
      templateSnapshot = { id: template.id, title: template.title, scope: template.scope, version: template.version, selectedContent: body.content };
    }
    const variableSnapshot = { version: 1, seed, variables } as Prisma.InputJsonValue;
    let recipientOrder = 0;
    const messageRows = selections.flatMap((selection) => {
      const account = accountMap.get(selection.accountId)!;
      return selection.friendIds.map((friendId) => {
        const friend = friendMap.get(friendId)!;
        const order = recipientOrder++;
        const rendered = renderContent({ template: body.content, variables, friendRemark: friend.remark, salutation: friend.salutation, scheduledAt, timezone: owner.timezone, seed, recipientOrder: order });
        try { assertSafeTagValue(rendered.content); } catch (error) { throw new BadRequestException((error as Error).message); }
        return {
          id: randomUUID(), messageId: randomUUID(), accountId: account.id, friendId,
          friendRemark: friend.remark, content: rendered.content, recipientOrder: order,
          recipientEmail: account.recipientEmail, subject: account.subject,
          minDelay: selection.minDelay ?? account.minDelay, maxDelay: selection.maxDelay ?? account.maxDelay,
          configVersion: account.configVersion, readyAt: scheduledAt,
        };
      });
    });
    return { seed, selections, accounts, accountMap, messageRows, templateSnapshot, variableSnapshot };
  }

  private fingerprint(seed: string, messages: Array<{ accountId: string; friendId: string; recipientOrder: number; content: string }>) {
    return createHash('sha256').update(JSON.stringify({
      seed,
      recipients: messages.map(({ accountId, friendId, recipientOrder, content }) => ({ accountId, friendId, recipientOrder, content })),
    })).digest('hex');
  }
}
