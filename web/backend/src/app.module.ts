import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { BillingModule } from './modules/billing.module';
import { IdentityModule } from './modules/identity.module';
import { IntelligenceModule } from './modules/intelligence.module';
import { MessagingModule } from './modules/messaging.module';
import { SystemModule } from './modules/system.module';

@Module({
  imports: [
    CoreModule,
    IdentityModule,
    IntelligenceModule,
    MessagingModule,
    BillingModule,
    SystemModule,
  ],
})
export class AppModule {}
