import { Module } from '@nestjs/common';
import { HealthController } from '../health';

@Module({ controllers: [HealthController] })
export class SystemModule {}
