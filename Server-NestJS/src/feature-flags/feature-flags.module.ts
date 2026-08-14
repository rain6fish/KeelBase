import { Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureDisabledGuard } from './feature-disabled.guard';

@Module({
  providers: [FeatureFlagsService, FeatureDisabledGuard],
  exports: [FeatureFlagsService, FeatureDisabledGuard],
})
export class FeatureFlagsModule {}
