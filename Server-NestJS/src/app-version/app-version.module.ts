import { Module } from '@nestjs/common';
import { AppVersionController } from './app-version.controller';
import { AppVersionService } from './app-version.service';
import { AppCapabilitiesController } from './app-capabilities.controller';
import { AppProvenanceController } from './app-provenance.controller';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [FeatureFlagsModule, AiModule],
  controllers: [AppVersionController, AppCapabilitiesController, AppProvenanceController],
  providers: [AppVersionService],
  exports: [AppVersionService],
})
export class AppVersionModule {}
