import { BadRequestException, Body, Controller, Get, Headers, Injectable, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard, AuthRequest, issueSession } from './auth';
import { config } from './config';
import { hashToken, randomToken } from './lib';
import { MailService } from './mail.service';
import { PrismaService } from './prisma.service';
import { WechatAccessService } from './wechat-access';
import { ZodPipe } from './zod.pipe';

const emailSchema = z.object({ email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()) });
const verifySchema = emailSchema.extend({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });
export function showDevelopmentTicket() { return config().AUTH_SHOW_DEV_TICKET && config().WECHAT_MINI_ENV_VERSION !== 'release'; }

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService, private readonly wechat: WechatAccessService) {}

  async rate(subject: string, limit: number, seconds: number) {
    const allowed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${subject}))`;
      const count = await tx.authChallenge.count({ where: { subject, kind: 'RATE', createdAt: { gt: new Date(Date.now() - seconds * 1000) } } });
      if (count >= limit) return false;
      await tx.authChallenge.create({ data: { id: randomUUID(), subject, kind: 'RATE', secretHash: '', expiresAt: new Date(Date.now() + seconds * 1000) } });
      return true;
    });
    if (!allowed) throw new BadRequestException('操作过于频繁，请稍后重试');
  }

  async sendCode(email: string, ip: string, userId?: string) {
    await this.rate(`email:${email}`, 1, 60);
    await this.rate(`mail-ip:${ip}`, 20, 3600);
    const code = String(randomInt(100000, 1000000));
    const item = await this.prisma.authChallenge.create({ data: { id: randomUUID(), kind: userId ? 'EMAIL_BIND' : 'EMAIL_LOGIN', subject: email, userId, secretHash: await hash(code, 10), expiresAt: new Date(Date.now() + 600000) } });
    try { await this.mail.send({ to: email, subject: '登录/绑定邮箱验证码（请勿触发快捷指令）', text: `你的验证码是 ${code}，10 分钟内有效。请勿转发给他人。如非本人操作请忽略。` }); }
    catch { await this.prisma.authChallenge.update({ where: { id: item.id }, data: { consumedAt: new Date() } }); throw new BadRequestException('验证码邮件发送失败，请稍后重试'); }
    return { challengeId: item.id, expiresIn: 600, retryAfter: 60 };
  }

  async verify(body: z.infer<typeof verifySchema>, userId?: string) {
    // A wrong attempt must commit before throwing; otherwise transaction rollback defeats the limit.
    const valid = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM auth_challenges WHERE id=${body.challengeId} FOR UPDATE`;
      const item = await tx.authChallenge.findUnique({ where: { id: body.challengeId } });
      if (!item || item.subject !== body.email || item.userId !== (userId || null) || item.kind !== (userId ? 'EMAIL_BIND' : 'EMAIL_LOGIN') || item.consumedAt || item.attempts >= 5 || item.expiresAt <= new Date()) return false;
      const ok = await compare(body.code, item.secretHash);
      await tx.authChallenge.update({ where: { id: item.id }, data: { attempts: { increment: 1 }, ...(ok ? { consumedAt: new Date() } : {}) } });
      return ok;
    });
    if (!valid) throw new BadRequestException('验证码错误或已失效，请重新获取');
    let user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (userId) {
      if (user && user.id !== userId) await this.prisma.$transaction((tx) => this.merge(tx, userId, user!.id));
      else user = await this.prisma.user.update({ where: { id: userId }, data: { email: body.email, emailVerifiedAt: new Date() } });
    } else if (!user) {
      user = await this.prisma.user.upsert({ where: { email: body.email }, create: { email: body.email, emailVerifiedAt: new Date(), username: `email_${randomBytes(12).toString('hex')}`, passwordHash: await hash(randomToken(), 10) }, update: {} });
    }
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('账号已停用');
    return issueSession(this.prisma, user.id);
  }

  // Only merge after both identities have been proved. Never silently discard conflicting business data.
  async merge(tx: Prisma.TransactionClient, sourceId: string, targetId: string) {
    if (sourceId === targetId) return targetId;
    const ids = [sourceId, targetId].sort();
    for (const id of ids) await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
    const source = await tx.user.findUniqueOrThrow({ where: { id: sourceId } });
    const target = await tx.user.findUniqueOrThrow({ where: { id: targetId } });
    if (source.status !== 'ACTIVE' || target.status !== 'ACTIVE') throw new BadRequestException('账号不可绑定');
    if ((source.email && target.email && source.email !== target.email) || (source.miniOpenid && target.miniOpenid && source.miniOpenid !== target.miniOpenid) || source.role !== 'USER') throw new BadRequestException('账号已绑定其他身份，不能自动合并');
    const accounts = await tx.wechatAccount.findMany({ where: { ownerId: sourceId }, select: { recipientEmail: true } });
    const variables = await tx.customVariable.findMany({ where: { ownerId: sourceId }, select: { name: true } });
    if (await tx.wechatAccount.count({ where: { ownerId: targetId, recipientEmail: { in: accounts.map((a) => a.recipientEmail) } } }) || await tx.customVariable.count({ where: { ownerId: targetId, name: { in: variables.map((v) => v.name) } } })) throw new BadRequestException('两账号存在重复的接收邮箱或变量名称，请先整理或改名后绑定；数据未变更');
    await tx.user.update({ where: { id: sourceId }, data: { email: null, miniOpenid: null, miniSessionKeyEncrypted: null, status: 'DISABLED' } });
    await tx.user.update({ where: { id: targetId }, data: { email: target.email || source.email, emailVerifiedAt: target.emailVerifiedAt || source.emailVerifiedAt, miniOpenid: target.miniOpenid || source.miniOpenid, miniUnionid: target.miniUnionid || source.miniUnionid, miniSessionKeyEncrypted: target.miniSessionKeyEncrypted || source.miniSessionKeyEncrypted, nickname: target.nickname || source.nickname, avatarUrl: target.avatarUrl || source.avatarUrl } });
    for (const model of [tx.wechatAccount,tx.friend,tx.friendGroup,tx.friendTag,tx.messageTemplate,tx.customVariable,tx.taskDraft]) await (model as unknown as {updateMany:(args:{where:{ownerId:string};data:{ownerId:string}})=>Promise<unknown>}).updateMany({ where: { ownerId: sourceId }, data: { ownerId: targetId } });
    // Preserve idempotency uniqueness when moving task history between independently created accounts.
    const tasks = await tx.task.findMany({ where: { ownerId: sourceId }, select: { id: true } });
    for (const task of tasks) await tx.task.update({ where: { id: task.id }, data: { ownerId: targetId, idempotencyKey: `merged:${task.id}` } });
    const favorites = await tx.templateFavorite.findMany({ where: { ownerId: sourceId } });
    await tx.templateFavorite.createMany({ data: favorites.map((f) => ({ ownerId: targetId, templateId: f.templateId })), skipDuplicates: true });
    await tx.templateFavorite.deleteMany({ where: { ownerId: sourceId } });
    for (const model of [tx.paymentOrder,tx.virtualPaymentOrder,tx.alipayOrder,tx.membershipGrant,tx.membershipUsage]) await (model as unknown as {updateMany:(args:{where:{userId:string};data:{userId:string}})=>Promise<unknown>}).updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
    await tx.session.deleteMany({ where: { userId: sourceId } });
    return targetId;
  }

  async ticket(ip: string, userId?: string) {
    await this.rate(`ticket:${ip}`, 30, 600);
    const id = `lg${randomBytes(12).toString('hex')}`, secret = randomToken();
    const expiresAt = new Date(Date.now() + 300000);
    await this.prisma.authChallenge.create({ data: { id, secretHash: hashToken(secret), kind: 'SCAN', subject: '', userId, expiresAt } });
    let qrDataUrl: string | undefined, qrError: string | undefined;
    try { qrDataUrl = await this.wechat.code(id); } catch { qrError = '小程序码暂不可用，请检查服务端小程序配置与版本'; }
    return { id, pollSecret: secret, expiresAt, qrDataUrl, qrError, ...(showDevelopmentTicket() ? { devTicket: id } : {}) };
  }
  async scanInfo(id: string) {
    const item = await this.prisma.authChallenge.findUnique({ where: { id } });
    if (!item || item.kind !== 'SCAN' || item.consumedAt || item.expiresAt <= new Date()) throw new BadRequestException('二维码已失效，请在网页刷新');
    const user = item.userId ? await this.prisma.user.findUnique({ where: { id: item.userId } }) : null;
    return { action: item.userId ? 'BIND' : 'LOGIN', account: user ? `${user.username.slice(0,3)}***` : null, ...(showDevelopmentTicket() ? { devTicket: id } : {}) };
  }
  async approve(id: string, userId: string) {
    const approved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM auth_challenges WHERE id=${id} FOR UPDATE`;
      const item = await tx.authChallenge.findUnique({ where: { id } });
      if (!item || item.kind !== 'SCAN' || item.expiresAt <= new Date() || item.consumedAt || item.approvedId) throw new BadRequestException('二维码已确认或已失效');
      const source = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!source.miniOpenid || source.status !== 'ACTIVE') throw new BadRequestException('请先使用微信登录');
      const target = item.userId ? await this.merge(tx, userId, item.userId) : userId;
      await tx.authChallenge.update({ where: { id }, data: { approvedId: target } });
      return target;
    });
    return { ...await issueSession(this.prisma, approved), ok: true };
  }
  async poll(id: string, secret: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM auth_challenges WHERE id=${id} FOR UPDATE`;
      const item = await tx.authChallenge.findUnique({ where: { id } });
      if (!item || item.kind !== 'SCAN' || hashToken(secret) !== item.secretHash) throw new UnauthorizedException('无效登录请求');
      if (item.consumedAt || item.expiresAt <= new Date()) return { status: 'EXPIRED' };
      if (!item.approvedId) return { status: 'WAITING' };
      const user = await tx.user.findUnique({ where: { id: item.approvedId } });
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('账号不可用');
      const token = randomToken(), expiresAt = new Date(Date.now() + config().SESSION_TTL_DAYS * 86400000);
      await tx.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt } });
      await tx.authChallenge.update({ where: { id }, data: { consumedAt: new Date() } });
      return { status: 'APPROVED', token, expiresAt };
    });
  }
}

@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}
  @Post('email/code') code(@Req() req: Request, @Body(new ZodPipe(emailSchema)) body: z.infer<typeof emailSchema>) { return this.identity.sendCode(body.email, req.ip || 'unknown'); }
  @Post('email/login') login(@Body(new ZodPipe(verifySchema)) body: z.infer<typeof verifySchema>) { return this.identity.verify(body); }
  @UseGuards(AuthGuard) @Post('email/bind/code') bindCode(@Req() req: AuthRequest, @Body(new ZodPipe(emailSchema)) body: z.infer<typeof emailSchema>) { return this.identity.sendCode(body.email, req.ip || 'unknown', req.user.id); }
  @UseGuards(AuthGuard) @Post('email/bind') bind(@Req() req: AuthRequest, @Body(new ZodPipe(verifySchema)) body: z.infer<typeof verifySchema>) { return this.identity.verify(body, req.user.id); }
  @Post('scan/tickets') ticket(@Req() req: Request) { return this.identity.ticket(req.ip || 'unknown'); }
  @UseGuards(AuthGuard) @Post('scan/bind') bindTicket(@Req() req: AuthRequest) { return this.identity.ticket(req.ip || 'unknown', req.user.id); }
  @UseGuards(AuthGuard) @Get('scan/:id') info(@Param('id') id: string) { return this.identity.scanInfo(id); }
  @UseGuards(AuthGuard) @Post('scan/:id/approve') approve(@Param('id') id: string, @Req() req: AuthRequest) { return this.identity.approve(id, req.user.id); }
  @Get('scan/:id/poll') poll(@Param('id') id: string, @Headers('x-poll-secret') secret = '') { return this.identity.poll(id, secret); }
}
