import { Body, Controller, Get, Post } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import {
  GeminiGenerateTextOptions,
  GeminiStatusResponse,
  GeminiTranslateOptions,
} from './gemini.types';

@Controller('ai')
export class AiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get('status')
  getStatus(): GeminiStatusResponse {
    return this.geminiService.getStatus();
  }

  @Post('generate')
  generate(@Body() body: GeminiGenerateTextOptions) {
    return this.geminiService.generateText(body);
  }

  @Post('translate')
  translate(@Body() body: GeminiTranslateOptions) {
    return this.geminiService.translateText(body);
  }
}
