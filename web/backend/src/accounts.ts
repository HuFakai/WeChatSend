import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { config } from './config';
import { hashToken } from './lib';
import { MailService } from './mail.service';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const accountSchema = z.object({
  name: z.string().trim().min(1).max(50),
  recipientEmail: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(100).default('WeChatSend'),
  minDelay: z.coerce.number().int().min(10).max(3600).default(10),
  maxDelay: z.coerce.number().int().min(10).max(3600).default(15),
}).refine((value) => value.minDelay <= value.maxDelay, {
  message: '最小间隔不能大于最大间隔', path: ['maxDelay'],
});

const patchAccountSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  recipientEmail: z.string().trim().email().max(254).optional(),
  subject: z.string().trim().min(1).max(100).optional(),
  minDelay: z.coerce.number().int().min(10).max(3600).optional(),
  maxDelay: z.coerce.number().int().min(10).max(3600).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

const verificationSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

@Controller('accounts')
@UseGuards(AuthGuard)
export class AccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Get()
  list(@Req() request: AuthRequest) {
    return this.prisma.wechatAccount.findMany({
      where: { ownerId: request.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, recipientEmail: true, subject: true, minDelay: true,
        maxDelay: true, emailVerifiedAt: true, status: true, configVersion: true,
        _count: { select: { friends: true } },
      },
    });
  }

  @Post()
  create(
    @Req() request: AuthRequest,
    @Body(new ZodPipe(accountSchema)) body: z.infer<typeof accountSchema>,
  ) {
    return this.prisma.wechatAccount.create({ data: { ownerId: request.user.id, ...body } });
  }

  @Patch(':id')
  async update(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(patchAccountSchema)) body: z.infer<typeof patchAccountSchema>,
  ) {
    const account = await this.owned(request.user.id, id);
    const minDelay = body.minDelay ?? account.minDelay;
    const maxDelay = body.maxDelay ?? account.maxDelay;
    if (minDelay > maxDelay) throw new BadRequestException('最小间隔不能大于最大间隔');
    const emailChanged = body.recipientEmail && body.recipientEmail !== account.recipientEmail;
    return this.prisma.wechatAccount.update({
      where: { id },
      data: {
        ...body,
        configVersion: { increment: 1 },
        ...(emailChanged ? { emailVerifiedAt: null, verificationHash: null, verificationUntil: null } : {}),
      },
    });
  }

  @Post(':id/update')
  updateFromMiniProgram(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(patchAccountSchema)) body: z.infer<typeof patchAccountSchema>,
  ) {
    return this.update(request, id, body);
  }

  @Post(':id/verification')
  async requestVerification(@Req() request: AuthRequest, @Param('id') id: string) {
    const account = await this.owned(request.user.id, id);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const verificationUntil = new Date(Date.now() + 10 * 60_000);
    await this.prisma.wechatAccount.update({
      where: { id }, data: { verificationHash: hashToken(code), verificationUntil },
    });
    await this.mail.send({
      to: account.recipientEmail,
      subject: config().VERIFY_SUBJECT,
      text: `你的 WeChatSend 邮箱验证码是：${code}\n\n10 分钟内有效。此邮件不会触发微信发送快捷指令。`,
    });
    return { ok: true, expiresAt: verificationUntil };
  }

  @Post(':id/verification/confirm')
  async confirmVerification(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(verificationSchema)) body: z.infer<typeof verificationSchema>,
  ) {
    const account = await this.owned(request.user.id, id);
    if (!account.verificationHash || !account.verificationUntil || account.verificationUntil <= new Date()) {
      throw new BadRequestException('验证码已过期，请重新获取');
    }
    if (hashToken(body.code) !== account.verificationHash) throw new BadRequestException('验证码错误');
    await this.prisma.wechatAccount.update({
      where: { id },
      data: { emailVerifiedAt: new Date(), verificationHash: null, verificationUntil: null },
    });
    return { ok: true };
  }

  private async owned(ownerId: string, id: string) {
    const account = await this.prisma.wechatAccount.findFirst({ where: { id, ownerId } });
    if (!account) throw new NotFoundException('发送账号不存在');
    return account;
  }
}
