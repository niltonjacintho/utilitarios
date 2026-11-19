import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FlowchartService } from './flowchart.service';
import {
  CreateFlowchartInput,
  GenerateFlowchartAiInput,
  UpdateFlowchartInput,
} from './flowchart.types';

@Controller('flowcharts')
@UseGuards(AuthGuard)
export class FlowchartController {
  constructor(private readonly flowchartService: FlowchartService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: 'mine' | 'shared' | 'archived',
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    return this.flowchartService.list(user, { scope, q, status });
  }

  @Post('ai/generate')
  generateNewWithAi(
    @CurrentUser() user: AuthUser,
    @Body() body: GenerateFlowchartAiInput,
  ) {
    return this.flowchartService.generateNewWithAi(user, body);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.flowchartService.findById(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateFlowchartInput) {
    return this.flowchartService.create(user, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateFlowchartInput,
  ) {
    return this.flowchartService.update(user, id, body);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.flowchartService.duplicate(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.flowchartService.remove(user, id);
  }

  @Post(':id/versions')
  createVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { label?: string },
  ) {
    return this.flowchartService.createVersion(user, id, body?.label);
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.flowchartService.restoreVersion(user, id, versionId);
  }

  @Post(':id/ai/generate')
  applyAiToExisting(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: GenerateFlowchartAiInput,
  ) {
    return this.flowchartService.applyAiToExisting(user, id, body);
  }

  @Post(':id/ai/summary')
  summarizeForExport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.flowchartService.summarizeForExport(user, id);
  }
}
