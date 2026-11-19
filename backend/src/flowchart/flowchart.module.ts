import { Module } from '@nestjs/common';
import { FlowchartController } from './flowchart.controller';
import { FlowchartService } from './flowchart.service';

@Module({
  controllers: [FlowchartController],
  providers: [FlowchartService],
  exports: [FlowchartService],
})
export class FlowchartModule {}
