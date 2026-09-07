import { Module } from '@nestjs/common';
import { AccountsController } from './accounts';
import { AuthController, AuthGuard } from './auth';
import { FriendsController } from './friends';
import { FeedbackController } from './feedback';
import { HealthController } from './health';
import { MailService } from './mail.service';
import { PrismaService } from './prisma.service';
import { TasksController } from './tasks';
import { DraftsController } from './drafts';
import { SegmentsController } from './segments';
import { TemplatesController } from './templates';
import { VariablesController } from './variables';
import { MiniAuthController } from './mini-auth';
import { AiController, AiService, MiniAiController } from './ai';
import { AdminController, AdminService } from './admin';
import { ExternalApiService } from './external-api';
import { PaymentsController, WechatPayService } from './payments';
import { ImportsController, ImportService } from './imports';

@Module({
  controllers: [HealthController, FeedbackController, AuthController, MiniAuthController, AccountsController, FriendsController, SegmentsController, TemplatesController, VariablesController, DraftsController, TasksController, AiController, MiniAiController, AdminController, PaymentsController, ImportsController],
  providers: [PrismaService, AuthGuard, MailService, ExternalApiService, AiService, AdminService, WechatPayService, ImportService],
})
export class AppModule {}
