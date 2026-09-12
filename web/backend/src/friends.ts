import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { assertSafeTagValue, normalizeRemark } from './lib';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const friendSchema = z.object({ remark: z.string().min(1).max(100), salutation: z.string().trim().max(100).optional().nullable() });
const patchFriendSchema = friendSchema.partial().extend({ status: z.enum(['ACTIVE', 'DISABLED']).optional() });
const bulkSchema = z.object({ remarks: z.array(z.string()).min(1).max(1000) });

@Controller()
@UseGuards(AuthGuard)
export class FriendsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('accounts/:accountId/friends')
  async list(
    @Req() request: AuthRequest,
    @Param('accountId') accountId: string,
    @Query('search') search = '',
  ) {
    await this.assertAccount(request.user.id, accountId);
    return this.prisma.friend.findMany({
      where: {
        ownerId: request.user.id, accountId, status: 'ACTIVE',
        ...(search ? { remark: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { remark: 'asc' },
      take: 500,
      include: {
        groupMemberships: { select: { groupId: true } },
        tagMemberships: { select: { tagId: true } },
      },
    });
  }

  @Post('accounts/:accountId/friends')
  async create(
    @Req() request: AuthRequest,
    @Param('accountId') accountId: string,
    @Body(new ZodPipe(friendSchema)) body: z.infer<typeof friendSchema>,
  ) {
    await this.assertAccount(request.user.id, accountId);
    const remark = normalizeRemark(body.remark);
    this.validateRemark(remark);
    return this.prisma.friend.create({
      data: { ownerId: request.user.id, accountId, remark, remarkKey: remark, salutation: body.salutation || null },
    });
  }

  @Post('accounts/:accountId/friends/bulk')
  async bulk(
    @Req() request: AuthRequest,
    @Param('accountId') accountId: string,
    @Body(new ZodPipe(bulkSchema)) body: z.infer<typeof bulkSchema>,
  ) {
    await this.assertAccount(request.user.id, accountId);
    const remarks = [...new Set(body.remarks.map(normalizeRemark).filter(Boolean))];
    remarks.forEach((remark) => this.validateRemark(remark));
    const existing = await this.prisma.friend.findMany({
      where: { accountId, remarkKey: { in: remarks } }, select: { remarkKey: true },
    });
    const existingKeys = new Set(existing.map((item) => item.remarkKey));
    const fresh = remarks.filter((remark) => !existingKeys.has(remark));
    await this.prisma.friend.createMany({
      data: fresh.map((remark) => ({ ownerId: request.user.id, accountId, remark, remarkKey: remark })),
      skipDuplicates: true,
    });
    return { created: fresh.length, skipped: remarks.length - fresh.length, items: fresh };
  }

  @Patch('friends/:id')
  async update(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(patchFriendSchema)) body: z.infer<typeof patchFriendSchema>,
  ) {
    const friend = await this.prisma.friend.findFirst({ where: { id, ownerId: request.user.id, status: 'ACTIVE' } });
    if (!friend) throw new NotFoundException('好友不存在');
    const remark = body.remark ? normalizeRemark(body.remark) : undefined;
    if (remark) this.validateRemark(remark);
    return this.prisma.friend.update({
      where: { id }, data: { ...body, ...(remark ? { remark, remarkKey: remark } : {}) },
    });
  }

  @Post('friends/:id/update')
  updateFromMiniProgram(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(patchFriendSchema)) body: z.infer<typeof patchFriendSchema>,
  ) {
    return this.update(request, id, body);
  }

  @Post('friends/:id/delete')
  async remove(@Req() request: AuthRequest, @Param('id') id: string) {
    const friend = await this.prisma.friend.findFirst({ where: { id, ownerId: request.user.id, status: 'ACTIVE' } });
    if (!friend) throw new NotFoundException('好友不存在');
    const processing = await this.prisma.taskMessage.count({
      where: { friendId: id, status: { in: ['PENDING', 'SENDING', 'RETRY_WAIT'] } },
    });
    if (processing) throw new BadRequestException('该好友仍有待发送任务，请先取消或等待任务结束后再删除');
    await this.prisma.friend.update({ where: { id }, data: { status: 'DISABLED', remarkKey: `__deleted__${id}` } });
    return { ok: true };
  }

  private validateRemark(remark: string) {
    try {
      assertSafeTagValue(remark);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (!remark || remark.includes('\n')) throw new BadRequestException('好友备注必须是非空单行文本');
  }

  private async assertAccount(ownerId: string, accountId: string) {
    const count = await this.prisma.wechatAccount.count({ where: { id: accountId, ownerId, status: 'ACTIVE' } });
    if (!count) throw new NotFoundException('发送账号不存在');
  }
}
