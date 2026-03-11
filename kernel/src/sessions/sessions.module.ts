import { Module, forwardRef } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { ScaffoldModule } from '../scaffold/scaffold.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionGcService } from './session-gc.service';

@Module({
  imports: [
    GatewayModule,
    forwardRef(() => ScaffoldModule),
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionGcService],
  exports: [SessionsService],
})
export class SessionsModule {}
