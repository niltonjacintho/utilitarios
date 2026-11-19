import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { ErStudioModule } from './erstudio/erstudio.module';
import { FlowchartModule } from './flowchart/flowchart.module';
import { HealthController } from './health/health.controller';
import { HubModule } from './hub/hub.module';
import { MindMapModule } from './mindmap/mindmap.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    AuthModule,
    AiModule,
    HubModule,
    MindMapModule,
    FlowchartModule,
    ErStudioModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
