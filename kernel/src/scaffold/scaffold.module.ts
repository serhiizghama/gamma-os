import { Module, forwardRef } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ScaffoldService } from './scaffold.service';
import { ScaffoldController } from './scaffold.controller';
import { ScaffoldAssetsController } from './scaffold-assets.controller';

@Module({
  imports: [RedisModule, forwardRef(() => SessionsModule)],
  controllers: [ScaffoldController, ScaffoldAssetsController],
  providers: [ScaffoldService],
  exports: [ScaffoldService],
})
export class ScaffoldModule {}
