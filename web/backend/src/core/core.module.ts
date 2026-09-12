import { Global, Module } from '@nestjs/common';
import { AuthGuard } from '../auth';
import { MailService } from '../mail.service';
import { PrismaService } from '../prisma.service';
import { WechatAccessService } from '../wechat-access';

/**
 * Infrastructure shared by every business module.
 * Keeping this module global prevents feature modules from creating their own
 * database clients, connection pools, or authentication guards.
 */
@Global()
@Module({
  providers: [PrismaService, AuthGuard, MailService, WechatAccessService],
  exports: [PrismaService, AuthGuard, MailService, WechatAccessService],
})
export class CoreModule {}
