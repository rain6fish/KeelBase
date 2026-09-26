// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { UsersModule } from '../users/users.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  // FeatureFlagsModule: the search must not surface rows of a module whose flag is off — see SearchService.
  // FeatureFlagsModule：开关关掉的模块，搜索不得返回它的记录 —— 见 SearchService。
  imports: [EventsModule, UsersModule, FeatureFlagsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
