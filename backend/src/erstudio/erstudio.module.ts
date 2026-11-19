import { Module } from '@nestjs/common';
import { DbIntrospectorService } from './db-introspector.service';
import { ErStudioController } from './erstudio.controller';
import { ErStudioService } from './erstudio.service';

@Module({
  controllers: [ErStudioController],
  providers: [DbIntrospectorService, ErStudioService],
  exports: [ErStudioService],
})
export class ErStudioModule {}
