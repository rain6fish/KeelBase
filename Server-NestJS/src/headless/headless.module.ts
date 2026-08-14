import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';
import { HeadlessApiKey } from './headless-api-key.entity';
import { HeadlessController } from './headless.controller';
import { HeadlessGuard } from './headless.guard';
import { HeadlessKeysService } from './headless-keys.service';

@Module({
  imports: [AiModule, UsersModule, TypeOrmModule.forFeature([HeadlessApiKey])],
  controllers: [HeadlessController],
  providers: [HeadlessGuard, HeadlessKeysService],
  exports: [HeadlessKeysService],
})
export class HeadlessModule {}
