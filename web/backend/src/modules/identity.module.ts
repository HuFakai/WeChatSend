import { Module } from '@nestjs/common';
import { AuthController } from '../auth';
import { IdentityController, IdentityService } from '../identity';
import { MiniAuthController } from '../mini-auth';

@Module({
  controllers: [AuthController, MiniAuthController, IdentityController],
  providers: [IdentityService],
})
export class IdentityModule {}
