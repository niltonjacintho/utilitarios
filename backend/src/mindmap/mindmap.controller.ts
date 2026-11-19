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
import { MindMapService } from './mindmap.service';
import {
  CreateMindMapInput,
  ExpandNodeAiInput,
  GenerateMindMapAiInput,
  UpdateMindMapInput,
} from './mindmap.types';

@Controller('mindmaps')
@UseGuards(AuthGuard)
export class MindMapController {
  constructor(private readonly mindMapService: MindMapService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.mindMapService.list(user, q);
  }

  @Post('ai/generate')
  generateWithAi(
    @CurrentUser() user: AuthUser,
    @Body() body: GenerateMindMapAiInput,
  ) {
    return this.mindMapService.generateWithAi(user, body);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mindMapService.findById(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateMindMapInput) {
    return this.mindMapService.create(user, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateMindMapInput,
  ) {
    return this.mindMapService.update(user, id, body);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mindMapService.duplicate(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mindMapService.remove(user, id);
  }

  @Post(':id/ai/explain')
  explainWithAi(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mindMapService.explainWithAi(user, id);
  }

  @Post(':id/ai/summary')
  summarizeForExport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mindMapService.summarizeForExport(user, id);
  }

  @Post(':id/ai/expand-node')
  expandNodeWithAi(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ExpandNodeAiInput,
  ) {
    return this.mindMapService.expandNodeWithAi(user, id, body);
  }
}
