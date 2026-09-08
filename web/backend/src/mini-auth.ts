import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AuthGuard, AuthRequest, issueSession } from './auth';
import { config } from './config';
import { randomToken } from './lib';
import { PrismaService } from './prisma.service';
import { encryptSecret } from './secrets';
import { ZodPipe } from './zod.pipe';

const profileSchema = z.object({
  code: z.string().trim().min(1).max(256),
  nickname: z.string().trim().max(100).optional(),
  avatarUrl: z.string().url().max(1000).optional(),
});

const codeSchema = z.object({ code: z.string().trim().min(1).max(256) });

type CodeSession = { openid: string; unionid?: string; sessionKey: string };

async function exchangeCode(code: string): Promise<CodeSession> {
  const cfg = config();
  if (!cfg.WECHAT_MINI_APPID || !cfg.WECHAT_MINI_SECRET) throw new BadRequestException('服务端未配置微信小程序 AppID/Secret');
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', cfg.WECHAT_MINI_APPID);
  url.searchParams.set('secret', cfg.WECHAT_MINI_SECRET);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const result = await response.json() as { openid?: string; unionid?: string; session_key?: string; errcode?: number; errmsg?: string };
  if (!response.ok || !result.openid) throw new UnauthorizedException(`微信登录失败：${result.errmsg || 'code 无效或已使用'}`);
  if (!result.session_key) throw new UnauthorizedException('微信登录未返回 session_key');
  return { openid: result.openid, unionid: result.unionid, sessionKey: result.session_key };
}

function safeMiniUsername(openid: string) {
  return `mini_${createHash('sha256').update(openid).digest('hex').slice(0, 24)}`;
}

@Controller('auth/miniprogram')
export class MiniAuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('silent')
  async silent(@Body(new ZodPipe(codeSchema)) body: z.infer<typeof codeSchema>) {
    const identity = await exchangeCode(body.code);
    const user = await this.prisma.user.findUnique({ where: { miniOpenid: identity.openid } });
    if (!user || user.status !== 'ACTIVE') throw new NotFoundException('MINI_ACCOUNT_NOT_FOUND');
    await this.prisma.user.update({ where: { id: user.id }, data: { miniSessionKeyEncrypted: encryptSecret(identity.sessionKey), miniUnionid: identity.unionid ?? user.miniUnionid } });
    const publicUser = this.publicUser(user);
    if (publicUser.needsProfile) return { token: null, expiresAt: null, user: publicUser };
    const session = await issueSession(this.prisma, user.id);
    return { ...session, user: publicUser };
  }

  @Post('login')
  async login(@Body(new ZodPipe(profileSchema)) body: z.infer<typeof profileSchema>) {
    const identity = await exchangeCode(body.code);
    let user = await this.prisma.user.findUnique({ where: { miniOpenid: identity.openid } });
    if (user?.status !== 'ACTIVE') throw new UnauthorizedException('账号已停用');
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          username: safeMiniUsername(identity.openid),
          passwordHash: await hash(randomToken(), 10),
          miniOpenid: identity.openid,
          miniUnionid: identity.unionid,
          miniSessionKeyEncrypted: encryptSecret(identity.sessionKey),
          nickname: body.nickname || null,
          avatarUrl: body.avatarUrl || null,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { miniUnionid: identity.unionid ?? user.miniUnionid, miniSessionKeyEncrypted: encryptSecret(identity.sessionKey), nickname: body.nickname ?? user.nickname, avatarUrl: body.avatarUrl ?? user.avatarUrl },
      });
    }
    const session = await issueSession(this.prisma, user.id);
    return { ...session, user: this.publicUser(user) };
  }

  @UseGuards(AuthGuard)
  @Post('bind')
  async bind(@Req() request: AuthRequest, @Body(new ZodPipe(codeSchema)) body: z.infer<typeof codeSchema>) {
    const identity = await exchangeCode(body.code);
    const owner = await this.prisma.user.findUnique({ where: { miniOpenid: identity.openid }, select: { id: true } });
    if (owner && owner.id !== request.user.id) throw new BadRequestException('该微信已绑定其他平台账号');
    const user = await this.prisma.user.update({ where: { id: request.user.id }, data: { miniOpenid: identity.openid, miniUnionid: identity.unionid, miniSessionKeyEncrypted: encryptSecret(identity.sessionKey) } });
    return this.publicUser(user);
  }

  private publicUser(user: { id: string; username: string; timezone: string; role: string; nickname: string | null; avatarUrl: string | null; miniOpenid: string | null }) {
    return { id: user.id, username: user.username, timezone: user.timezone, role: user.role, nickname: user.nickname, avatarUrl: user.avatarUrl, hasMiniOpenid: Boolean(user.miniOpenid), needsProfile: !user.nickname || !user.avatarUrl };
  }
}
