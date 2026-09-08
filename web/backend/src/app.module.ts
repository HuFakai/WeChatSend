import { AlipayConfigService, AlipayAdminController } from './alipay-config';
import { OrdersService, OrdersController, AdminOrdersController } from './orders';
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
import { VirtualPaymentAdminController, VirtualPaymentController, VirtualPaymentService } from './virtual-payment';
import { AlipayController, AlipayService } from './alipay';
import { IdentityController, IdentityService } from './identity';
import { WechatAccessService } from './wechat-access';

@Module({
  controllers: [IdentityController, AlipayAdminController, OrdersController, AdminOrdersController, HealthController, FeedbackController, AuthController, MiniAuthController, AccountsController, FriendsController, SegmentsController, TemplatesController, VariablesController, DraftsController, TasksController, AiController, MiniAiController, AdminController, PaymentsController, ImportsController, VirtualPaymentController, VirtualPaymentAdminController, AlipayController],
  providers: [AlipayConfigService, OrdersService, PrismaService, AuthGuard, MailService, ExternalApiService, AiService, AdminService, WechatPayService, ImportService, VirtualPaymentService, AlipayService, IdentityService, WechatAccessService],
})
export class AppModule {}
