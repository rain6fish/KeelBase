import { Module } from '@nestjs/common';
import { AppVersionController } from './app-version.controller';
import { AppVersionService } from './app-version.service';
import { AppCapabilitiesController } from './app-capabilities.controller';
import { CapabilitiesService } from './capabilities.service';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';

@Module({
  imports: [FeatureFlagsModule],
  controllers: [AppVersionController, AppCapabilitiesController],
  providers: [AppVersionService, CapabilitiesService],
  exports: [AppVersionService, CapabilitiesService],
})
export class AppVersionModule {}
