import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const nameSchema = z.object({ name: z.string().trim().min(1).max(40) });
const membershipSchema = z.object({ friendIds: z.array(z.string().uuid()).max(5000) });
const friendSegmentsSchema = z.object({
  groupIds: z.array(z.string().uuid()).max(200).default([]),
  tagIds: z.array(z.string().uuid()).max(200).default([]),
});

@Controller()
@UseGuards(AuthGuard)
export class SegmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('accounts/:accountId/groups')
  groups(@Req() request: AuthRequest, @Param('accountId') accountId: string) {
    return this.list(request.user.id, accountId, 'group');
  }

  @Get('accounts/:accountId/tags')
  tags(@Req() request: AuthRequest, @Param('accountId') accountId: string) {
    return this.list(request.user.id, accountId, 'tag');
  }

  @Post('accounts/:accountId/groups')
  createGroup(@Req() request: AuthRequest, @Param('accountId') accountId: string, @Body(new ZodPipe(nameSchema)) body: z.infer<typeof nameSchema>) {
    return this.create(request.user.id, accountId, body.name, 'group');
  }

  @Post('accounts/:accountId/tags')
  createTag(@Req() request: AuthRequest, @Param('accountId') accountId: string, @Body(new ZodPipe(nameSchema)) body: z.infer<typeof nameSchema>) {
    return this.create(request.user.id, accountId, body.name, 'tag');
  }

  @Patch('groups/:id')
  updateGroup(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(nameSchema)) body: z.infer<typeof nameSchema>) {
    return this.rename(request.user.id, id, body.name, 'group');
  }

  @Post('groups/:id/update')
  updateGroupFromMini(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(nameSchema)) body: z.infer<typeof nameSchema>) {
    return this.rename(request.user.id, id, body.name, 'group');
  }

  @Patch('tags/:id')
  updateTag(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(nameSchema)) body: z.infer<typeof nameSchema>) {
    return this.rename(request.user.id, id, body.name, 'tag');
  }

  @Post('tags/:id/update')
  updateTagFromMini(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(nameSchema)) body: z.infer<typeof nameSchema>) {
    return this.rename(request.user.id, id, body.name, 'tag');
  }

  @Post('groups/:id/delete')
  removeGroup(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.remove(request.user.id, id, 'group');
  }

  @Post('tags/:id/delete')
  removeTag(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.remove(request.user.id, id, 'tag');
  }

  @Post('groups/:id/friends')
  setGroupFriends(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(membershipSchema)) body: z.infer<typeof membershipSchema>) {
    return this.setMembers(request.user.id, id, body.friendIds, 'group');
  }

  @Post('tags/:id/friends')
  setTagFriends(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(membershipSchema)) body: z.infer<typeof membershipSchema>) {
    return this.setMembers(request.user.id, id, body.friendIds, 'tag');
  }

  @Post('friends/:id/segments')
  async setFriendSegments(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(friendSegmentsSchema)) body: z.infer<typeof friendSegmentsSchema>) {
    const friend = await this.prisma.friend.findFirst({ where: { id, ownerId: request.user.id } });
    if (!friend) throw new NotFoundException('好友不存在');
    const [groups, tags] = await Promise.all([
      this.prisma.friendGroup.findMany({ where: { id: { in: body.groupIds }, ownerId: request.user.id, accountId: friend.accountId } }),
      this.prisma.friendTag.findMany({ where: { id: { in: body.tagIds }, ownerId: request.user.id, accountId: friend.accountId } }),
    ]);
    if (groups.length !== new Set(body.groupIds).size || tags.length !== new Set(body.tagIds).size) throw new BadRequestException('包含无效或跨账号的分组/标签');
    await this.prisma.$transaction(async (tx) => {
      await tx.friendGroupMember.deleteMany({ where: { friendId: id } });
      await tx.friendTagMember.deleteMany({ where: { friendId: id } });
      if (groups.length) await tx.friendGroupMember.createMany({ data: groups.map((item) => ({ groupId: item.id, friendId: id })) });
      if (tags.length) await tx.friendTagMember.createMany({ data: tags.map((item) => ({ tagId: item.id, friendId: id })) });
    });
    return { ok: true };
  }

  private async list(ownerId: string, accountId: string, kind: 'group' | 'tag') {
    await this.assertAccount(ownerId, accountId);
    if (kind === 'group') {
      const items = await this.prisma.friendGroup.findMany({ where: { ownerId, accountId }, orderBy: { name: 'asc' }, include: { members: { select: { friendId: true } } } });
      return items.map(({ members, ...item }) => ({ ...item, friendIds: members.map((member) => member.friendId) }));
    }
    const items = await this.prisma.friendTag.findMany({ where: { ownerId, accountId }, orderBy: { name: 'asc' }, include: { members: { select: { friendId: true } } } });
    return items.map(({ members, ...item }) => ({ ...item, friendIds: members.map((member) => member.friendId) }));
  }

  private async create(ownerId: string, accountId: string, name: string, kind: 'group' | 'tag') {
    await this.assertAccount(ownerId, accountId);
    try {
      return kind === 'group'
        ? await this.prisma.friendGroup.create({ data: { ownerId, accountId, name } })
        : await this.prisma.friendTag.create({ data: { ownerId, accountId, name } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException(`${kind === 'group' ? '分组' : '标签'}名称已存在`);
      throw error;
    }
  }

  private async rename(ownerId: string, id: string, name: string, kind: 'group' | 'tag') {
    try {
      if (kind === 'group') {
        const item = await this.prisma.friendGroup.findFirst({ where: { id, ownerId } });
        if (!item) throw new NotFoundException('分组不存在');
        return await this.prisma.friendGroup.update({ where: { id }, data: { name } });
      }
      const item = await this.prisma.friendTag.findFirst({ where: { id, ownerId } });
      if (!item) throw new NotFoundException('标签不存在');
      return await this.prisma.friendTag.update({ where: { id }, data: { name } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException(`${kind === 'group' ? '分组' : '标签'}名称已存在`);
      throw error;
    }
  }

  private async remove(ownerId: string, id: string, kind: 'group' | 'tag') {
    const result = kind === 'group'
      ? await this.prisma.friendGroup.deleteMany({ where: { id, ownerId } })
      : await this.prisma.friendTag.deleteMany({ where: { id, ownerId } });
    if (!result.count) throw new NotFoundException(kind === 'group' ? '分组不存在' : '标签不存在');
    return { ok: true };
  }

  private async setMembers(ownerId: string, id: string, friendIds: string[], kind: 'group' | 'tag') {
    const segment = kind === 'group'
      ? await this.prisma.friendGroup.findFirst({ where: { id, ownerId } })
      : await this.prisma.friendTag.findFirst({ where: { id, ownerId } });
    if (!segment) throw new NotFoundException(kind === 'group' ? '分组不存在' : '标签不存在');
    const unique = [...new Set(friendIds)];
    const friends = await this.prisma.friend.findMany({ where: { id: { in: unique }, ownerId, accountId: segment.accountId } });
    if (friends.length !== unique.length) throw new BadRequestException('包含无效或跨账号好友');
    await this.prisma.$transaction(async (tx) => {
      if (kind === 'group') {
        await tx.friendGroupMember.deleteMany({ where: { groupId: id } });
        if (unique.length) await tx.friendGroupMember.createMany({ data: unique.map((friendId) => ({ groupId: id, friendId })) });
      } else {
        await tx.friendTagMember.deleteMany({ where: { tagId: id } });
        if (unique.length) await tx.friendTagMember.createMany({ data: unique.map((friendId) => ({ tagId: id, friendId })) });
      }
    });
    return { ok: true, count: unique.length };
  }

  private async assertAccount(ownerId: string, accountId: string) {
    if (!await this.prisma.wechatAccount.count({ where: { id: accountId, ownerId } })) throw new NotFoundException('发送账号不存在');
  }
}
