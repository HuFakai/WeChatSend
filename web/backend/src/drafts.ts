import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const draftSelection = z.object({
  accountId: z.string().uuid(),
  friendIds: z.array(z.string().uuid()).max(5000).default([]),
  groupIds: z.array(z.string().uuid()).max(500).default([]),
  tagIds: z.array(z.string().uuid()).max(500).default([]),
  minDelay: z.number().int().min(10).max(3600).optional(),
  maxDelay: z.number().int().min(10).max(3600).optional(),
});
const draftSchema = z.object({
  title: z.string().trim().max(100).default('未命名草稿'),
  content: z.string().max(10000).default(''),
  scheduledAt: z.string().datetime().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  renderSeed: z.string().min(8).max(100).optional(),
  selections: z.array(draftSelection).max(100).default([]),
  sourceTaskId: z.string().uuid().nullable().optional(),
});

@Controller('drafts')
@UseGuards(AuthGuard)
export class DraftsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() request: AuthRequest) {
    return this.prisma.taskDraft.findMany({ where: { ownerId: request.user.id }, orderBy: { updatedAt: 'desc' }, take: 100 });
  }

  @Get(':id')
  async detail(@Req() request: AuthRequest, @Param('id') id: string) {
    const item = await this.prisma.taskDraft.findFirst({ where: { id, ownerId: request.user.id } });
    if (!item) throw new NotFoundException('草稿不存在');
    return item;
  }

  @Post()
  create(@Req() request: AuthRequest, @Body(new ZodPipe(draftSchema)) body: z.infer<typeof draftSchema>) {
    return this.prisma.taskDraft.create({ data: this.data(request.user.id, body) });
  }

  @Patch(':id')
  update(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(draftSchema)) body: z.infer<typeof draftSchema>) {
    return this.updateOwned(request.user.id, id, body);
  }

  @Post(':id/update')
  updateFromMini(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(draftSchema)) body: z.infer<typeof draftSchema>) {
    return this.updateOwned(request.user.id, id, body);
  }

  @Post(':id/delete')
  async remove(@Req() request: AuthRequest, @Param('id') id: string) {
    const result = await this.prisma.taskDraft.deleteMany({ where: { id, ownerId: request.user.id } });
    if (!result.count) throw new NotFoundException('草稿不存在');
    return { ok: true };
  }

  private async updateOwned(ownerId: string, id: string, body: z.infer<typeof draftSchema>) {
    if (!await this.prisma.taskDraft.count({ where: { id, ownerId } })) throw new NotFoundException('草稿不存在');
    return this.prisma.taskDraft.update({ where: { id }, data: this.data(ownerId, body) });
  }

  private data(ownerId: string, body: z.infer<typeof draftSchema>) {
    const { title, content, scheduledAt, sourceTaskId, ...payload } = body;
    return {
      ownerId, title: title || '未命名草稿', content,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      sourceTaskId: sourceTaskId || null,
      payload: { ...payload, selections: body.selections } as Prisma.InputJsonValue,
    };
  }
}
