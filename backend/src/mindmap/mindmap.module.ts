import { Module } from '@nestjs/common';
import { MindMapController } from './mindmap.controller';
import { MindMapService } from './mindmap.service';

@Module({
  controllers: [MindMapController],
  providers: [MindMapService],
  exports: [MindMapService],
})
export class MindMapModule {}
