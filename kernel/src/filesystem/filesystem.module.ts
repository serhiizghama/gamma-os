import { Module } from '@nestjs/common';
import { FilesystemController } from './filesystem.controller';

@Module({
  controllers: [FilesystemController],
})
export class FilesystemModule {}
