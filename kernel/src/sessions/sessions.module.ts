import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionGcService } from './session-gc.service';

@Module({
  imports: [GatewayModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionGcService],
  exports: [SessionsService],
})
export class SessionsModule {}
