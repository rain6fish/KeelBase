import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { HeadlessController } from './headless.controller';
import { HeadlessGuard } from './headless.guard';

@Module({
  imports: [AiModule],
  controllers: [HeadlessController],
  providers: [HeadlessGuard],
})
export class HeadlessModule {}
