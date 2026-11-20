import { Controller, Get } from '@nestjs/common';
import { GeminiService } from '../ai/gemini.service';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'hub-prototipos-api',
      database: this.db.getInfo(),
      ai: this.geminiService.getStatus(),
      timestamp: new Date().toISOString(),
    };
  }
}
