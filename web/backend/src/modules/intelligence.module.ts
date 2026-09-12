import { Module } from '@nestjs/common';
import { AdminController, AdminService } from '../admin';
import { AiController, AiService, MiniAiController } from '../ai';
import { ExternalApiService } from '../external-api';
import { ImportsController, ImportService } from '../imports';

@Module({
  controllers: [AiController, MiniAiController, AdminController, ImportsController],
  providers: [ExternalApiService, AiService, AdminService, ImportService],
  exports: [ExternalApiService, AiService],
})
export class IntelligenceModule {}
