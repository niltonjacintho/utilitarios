import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { HubService } from './hub.service';
import { HubConfigResponse, HubSolution } from './hub.types';

@Controller()
export class HubController {
  constructor(
    private readonly hubService: HubService,
    private readonly authService: AuthService,
  ) {}

  @Get('hub')
  getHubConfig(@Req() req: Request): HubConfigResponse {
    const token = this.authService.extractSessionToken(req);
    const authUser = this.authService.getUserBySessionToken(token);
    return this.hubService.getHubConfig(authUser);
  }

  @Get('solutions')
  getSolutions(): HubSolution[] {
    return this.hubService.getSolutions();
  }

  @Get('solutions/:slug')
  getSolutionBySlug(@Param('slug') slug: string): HubSolution {
    return this.hubService.getSolutionBySlug(slug);
  }
}
