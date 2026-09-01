// SPDX-License-Identifier: Apache-2.0

import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from './settings.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';

/** 动态配置中心：全局模块，维护模式 guard 与 ai.service 依赖。 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Setting]), FeatureFlagsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
