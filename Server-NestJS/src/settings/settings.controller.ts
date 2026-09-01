// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Put, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ApplyPresetDto } from './dto/apply-preset.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';

@ApiTags('动态配置（RG-2）')
@ApiBearerAuth()
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '全部动态配置（管理员）' })
  async findAll() {
    return this.settingsService.findAll();
  }

  @Put(':key')
  @SkipAudit()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '更新/创建动态配置（管理员，实时生效）' })
  async update(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.settingsService.set(key, dto.value, dto.type);
  }

  @Post('preset')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'EASY-5 应用首启预设（full/small/lite）：写 feature_* Settings + 内存覆盖，返回应用后 flags' })
  async applyPreset(@Body() dto: ApplyPresetDto) {
    return this.featureFlags.applyPreset(dto.preset);
  }
}
