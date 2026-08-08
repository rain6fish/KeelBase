import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';

@ApiTags('动态配置（RG-2）')
@ApiBearerAuth()
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
}
