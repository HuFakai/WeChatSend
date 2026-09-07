import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MessageStatus, Prisma, TaskStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { assertSafeTagValue } from './lib';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const selectionSchema = z.object({
  accountId: z.string().uuid(),
  friendIds: z.array(z.string().uuid()).min(1).max(5000),
  minDelay: z.number().int().min(10).max(3600).optional(),
  maxDelay: z.number().int().min(10).max(3600).optional(),
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(100),
  content: z.string().min(1).max(10000),
  scheduledAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(8).max(100),
  selections: z.array(selectionSchema).min(1).max(100),
});

const resendSchema = z.object({ idempotencyKey: z.string().min(8).max(100) });

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() request: AuthRequest) {
    return this.prisma.task.findMany({
      where: { ownerId: request.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { messages: true } } },
    });
  }

  @Get('summary')
  async summary(@Req() request: AuthRequest) {
    const [accounts, friends, tasks, statuses] = await Promise.all([
      this.prisma.wechatAccount.count({ where: { ownerId: request.user.id, status: 'ACTIVE' } }),
      this.prisma.friend.count({ where: { ownerId: request.user.id, status: 'ACTIVE' } }),
      this.prisma.task.count({ where: { ownerId: request.user.id } }),
      this.prisma.taskMessage.groupBy({
        by: ['status'], where: { task: { ownerId: request.user.id } }, _count: { _all: true },
      }),
    ]);
    return { accounts, friends, tasks, messages: Object.fromEntries(statuses.map((s) => [s.status, s._count._all])) };
  }

  @Get(':id')
  async detail(@Req() request: AuthRequest, @Param('id') id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, ownerId: request.user.id },
      include: {
        accountSettings: true,
        messages: { orderBy: { createdAt: 'asc' }, include: { attempts: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!task) throw new NotFoundException('任务不存在');
    return task;
  }

  @Post()
  async create(
    @Req() request: AuthRequest,
    @Body(new ZodPipe(createTaskSchema)) body: z.infer<typeof createTaskSchema>,
  ) {
    try {
      assertSafeTagValue(body.content);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    if (scheduledAt.getTime() < Date.now() - 60_000) throw new BadRequestException('定时时间不能早于当前时间');

    const dedupedSelections = new Map<string, z.infer<typeof selectionSchema>>();
    for (const selection of body.selections) {
      const current = dedupedSelections.get(selection.accountId);
      dedupedSelections.set(selection.accountId, {
        ...selection,
        friendIds: [...new Set([...(current?.friendIds ?? []), ...selection.friendIds])],
      });
    }
    const selections = [...dedupedSelections.values()];
    const accountIds = selections.map((selection) => selection.accountId);
    const accounts = await this.prisma.wechatAccount.findMany({
      where: { id: { in: accountIds }, ownerId: request.user.id, status: 'ACTIVE' },
    });
    if (accounts.length !== accountIds.length) throw new BadRequestException('包含不存在或已停用的发送账号');
    if (accounts.some((account) => !account.emailVerifiedAt)) throw new BadRequestException('请先完成所有发送账号的邮箱验证');

    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const allFriendIds = selections.flatMap((selection) => selection.friendIds);
    const friends = await this.prisma.friend.findMany({
      where: { id: { in: allFriendIds }, ownerId: request.user.id, status: 'ACTIVE' },
    });
    const friendMap = new Map(friends.map((friend) => [friend.id, friend]));
    if (friendMap.size !== new Set(allFriendIds).size) throw new BadRequestException('包含不存在或已停用的好友');
    for (const selection of selections) {
      if (selection.friendIds.some((id) => friendMap.get(id)?.accountId !== selection.accountId)) {
        throw new BadRequestException('好友与发送账号不匹配');
      }
      const account = accountMap.get(selection.accountId)!;
      const min = selection.minDelay ?? account.minDelay;
      const max = selection.maxDelay ?? account.maxDelay;
      if (min < 10 || max < 10) throw new BadRequestException('发送间隔不能小于 10 秒');
      if (min > max) throw new BadRequestException('最小间隔不能大于最大间隔');
    }

    const taskId = randomUUID();
    const now = new Date();
    const status: TaskStatus = scheduledAt > now ? 'SCHEDULED' : 'RUNNING';
    const messageRows = selections.flatMap((selection) => {
      const account = accountMap.get(selection.accountId)!;
      const minDelay = selection.minDelay ?? account.minDelay;
      const maxDelay = selection.maxDelay ?? account.maxDelay;
      return selection.friendIds.map((friendId) => {
        const friend = friendMap.get(friendId)!;
        return {
          id: randomUUID(), messageId: randomUUID(), taskId, accountId: account.id, friendId,
          friendRemark: friend.remark, content: body.content, recipientEmail: account.recipientEmail,
          subject: account.subject, minDelay, maxDelay, configVersion: account.configVersion,
          readyAt: scheduledAt,
        };
      });
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.task.create({
          data: {
            id: taskId, ownerId: request.user.id, title: body.title, content: body.content,
            scheduledAt, status, idempotencyKey: body.idempotencyKey,
          },
        });
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
        await tx.taskMessage.createMany({ data: messageRows });
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
          where: { ownerId_idempotencyKey: { ownerId: request.user.id, idempotencyKey: body.idempotencyKey } },
        });
        if (existing) return existing;
      }
      throw error;
    }
    return this.detail(request, taskId);
  }

  @Post(':id/cancel')
  async cancel(@Req() request: AuthRequest, @Param('id') id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, ownerId: request.user.id } });
    if (!task) throw new NotFoundException('任务不存在');
    await this.prisma.$transaction([
      this.prisma.taskMessage.updateMany({
        where: { taskId: id, status: { in: ['PENDING', 'RETRY_WAIT'] } },
        data: { status: MessageStatus.CANCELLED, errorCode: 'USER_CANCELLED', errorMessage: '用户取消' },
      }),
      this.prisma.task.update({ where: { id }, data: { status: TaskStatus.CANCELLED } }),
    ]);
    return { ok: true };
  }

  @Post(':id/messages/:messageId/resend')
  async resend(
    @Req() request: AuthRequest,
    @Param('id') taskId: string,
    @Param('messageId') messageId: string,
    @Body(new ZodPipe(resendSchema)) body: z.infer<typeof resendSchema>,
  ) {
    const message = await this.prisma.taskMessage.findFirst({
      where: { id: messageId, taskId, task: { ownerId: request.user.id } },
      include: { task: true },
    });
    if (!message) throw new NotFoundException('邮件记录不存在');
    if (!['FAILED', 'UNKNOWN'].includes(message.status)) {
      throw new BadRequestException('只有发送失败或结果待核实的记录可以人工重发');
    }

    return this.create(request, {
      title: `重发：${message.task.title}`.slice(0, 100),
      content: message.content,
      idempotencyKey: body.idempotencyKey,
      selections: [{
        accountId: message.accountId,
        friendIds: [message.friendId],
        minDelay: message.minDelay,
        maxDelay: message.maxDelay,
      }],
    });
  }
}
