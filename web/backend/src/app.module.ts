import { Module } from '@nestjs/common';
import { AccountsController } from './accounts';
import { AuthController, AuthGuard } from './auth';
import { FriendsController } from './friends';
import { FeedbackController } from './feedback';
import { HealthController } from './health';
import { MailService } from './mail.service';
import { PrismaService } from './prisma.service';
import { TasksController } from './tasks';

@Module({
  controllers: [HealthController, FeedbackController, AuthController, AccountsController, FriendsController, TasksController],
  providers: [PrismaService, AuthGuard, MailService],
})
export class AppModule {}
