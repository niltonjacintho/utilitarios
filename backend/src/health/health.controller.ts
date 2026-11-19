import { Controller, Get } from '@nestjs/common';
import { GeminiService } from '../ai/gemini.service';

@Controller('health')
export class HealthController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'hub-prototipos-api',
      ai: this.geminiService.getStatus(),
      timestamp: new Date().toISOString(),
    };
  }
}
