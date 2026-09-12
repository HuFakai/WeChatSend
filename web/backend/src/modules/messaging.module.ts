import { Module } from '@nestjs/common';
import { AccountsController } from '../accounts';
import { DraftsController } from '../drafts';
import { FeedbackController } from '../feedback';
import { FriendsController } from '../friends';
import { SegmentsController } from '../segments';
import { TasksController } from '../tasks';
import { TemplatesController } from '../templates';
import { VariablesController } from '../variables';
import { IntelligenceModule } from './intelligence.module';

@Module({
  imports: [IntelligenceModule],
  controllers: [
    AccountsController,
    FriendsController,
    SegmentsController,
    TemplatesController,
    VariablesController,
    DraftsController,
    TasksController,
    FeedbackController,
  ],
})
export class MessagingModule {}
