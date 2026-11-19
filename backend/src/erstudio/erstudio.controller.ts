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
import { ErStudioService } from './erstudio.service';
import {
  CreateErProjectInput,
  ErDbConnectionTestInput,
  UpdateErProjectInput,
} from './erstudio.types';

@Controller('erstudio')
@UseGuards(AuthGuard)
export class ErStudioController {
  constructor(private readonly erStudioService: ErStudioService) {}

  @Get('users/lookup')
  listUsers(@CurrentUser() user: AuthUser) {
    return this.erStudioService.listUsersForSharing(user);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: 'all' | 'mine' | 'shared',
    @Query('q') q?: string,
    @Query('sort') sort?: 'recent' | 'name',
  ) {
    return this.erStudioService.list(user, { scope, q, sort });
  }

  @Post('db/test')
  testDbConnection(@Body() body: ErDbConnectionTestInput) {
    return this.erStudioService.testDbConnection(body);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.erStudioService.findById(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateErProjectInput,
  ) {
    return this.erStudioService.create(user, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateErProjectInput,
  ) {
    return this.erStudioService.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.erStudioService.remove(user, id);
  }

  @Post(':id/transfer-ownership')
  transferOwnership(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { newOwnerEmail: string; keepEditAccess?: boolean },
  ) {
    return this.erStudioService.transferOwnership(
      user,
      id,
      body.newOwnerEmail,
      body.keepEditAccess ?? true,
    );
  }

  @Post(':id/db/introspect')
  introspectDbReadOnly(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ErDbConnectionTestInput,
  ) {
    return this.erStudioService.introspectDbReadOnly(user, id, body);
  }

  @Post(':id/ddl/import')
  importDdl(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { ddl: string; mode?: 'replace' | 'merge' },
  ) {
    return this.erStudioService.importDdl(user, id, body.ddl, body.mode);
  }

  @Post(':id/ai/plan')
  planAiAdjustment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { prompt: string },
  ) {
    return this.erStudioService.planAiAdjustment(user, id, body.prompt);
  }

  @Post(':id/submodels/:subModelId/ai/summary')
  summarizeSubModel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('subModelId') subModelId: string,
  ) {
    return this.erStudioService.summarizeSubModel(user, id, subModelId);
  }
}
