import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { compare } from 'bcryptjs';
import type { Request } from 'express';
import { z } from 'zod';
import { config } from './config';
import { hashToken, randomToken } from './lib';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

export type AuthRequest = Request & { user: User; sessionId: string };

export function assertAdmin(request: AuthRequest) {
  if (request.user.role !== 'ADMIN') throw new ForbiddenException('仅管理员可操作');
}

export async function issueSession(prisma: PrismaService, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + config().SESSION_TTL_DAYS * 86_400_000);
  await prisma.resilient(() => prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  }));
  return { token, expiresAt };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('请先登录');

    const session = await this.prisma.resilient(() => this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    }));
    if (!session || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('登录已失效');
    }
    request.user = session.user;
    request.sessionId = session.id;
    return true;
  }
}

const loginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(128),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('login')
  async login(@Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>) {
    const user = await this.prisma.resilient(() => this.prisma.user.findUnique({ where: { username: body.username } }));
    if (!user || user.status !== 'ACTIVE' || !(await compare(body.password, user.passwordHash))) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const session = await issueSession(this.prisma, user.id);
    return { ...session, user: { id: user.id, username: user.username, timezone: user.timezone, role: user.role, nickname: user.nickname, avatarUrl: user.avatarUrl } };
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  async logout(@Req() request: AuthRequest) {
    await this.prisma.session.delete({ where: { id: request.sessionId } }).catch(() => undefined);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: AuthRequest) {
    const { id, username, timezone, role, nickname, avatarUrl, miniOpenid } = request.user;
    return { id, username, timezone, role, nickname, avatarUrl, hasMiniOpenid: Boolean(miniOpenid) };
  }
}
