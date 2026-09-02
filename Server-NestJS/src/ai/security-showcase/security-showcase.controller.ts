// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SecurityShowcaseService } from './security-showcase.service';
import { CheckPolicies } from '../../common/casl/check-policies.decorator';

@ApiTags('安全演示（A2 对抗性证明产品化）')
@ApiBearerAuth()
@Controller({ path: 'ai/security-showcase', version: '1' })
export class SecurityShowcaseController {
  constructor(private readonly showcase: SecurityShowcaseService) {}

  @Get('scenarios')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '对抗性安全演示场景清单（admin）' })
  listScenarios() {
    return this.showcase.listScenarios();
  }

  @Post('run/:scenarioId')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '运行确定性对抗场景，返回 outcome + 决策轨迹（admin）' })
  runScenario(@Param('scenarioId') scenarioId: string) {
    return this.showcase.runScenario(scenarioId);
  }
}
