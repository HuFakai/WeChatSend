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

@Module({
  controllers: [HealthController, FeedbackController, AuthController, AccountsController, FriendsController, SegmentsController, TemplatesController, VariablesController, DraftsController, TasksController],
  providers: [PrismaService, AuthGuard, MailService],
})
export class AppModule {}
