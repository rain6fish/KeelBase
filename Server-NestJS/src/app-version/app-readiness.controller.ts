// SPDX-License-Identifier: Apache-2.0

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/guards/public.decorator';
import { ReadinessService } from './readiness.service';

/**
 * NC-3 DX-1 首次运行就绪清单（公开，onboarding——与 /app/version、/app/capabilities、/app/provenance 同族）。
 * 与 GET /health?detail=true 的分工：health 是给探针/告警的**运维探活**；本端点是给人看的**首次运行引导**
 * （五维就绪 + 每维可执行下一步）。不暴露密钥等敏感值，只报「配没配」。
 */
@ApiTags('首次运行就绪')
@SkipThrottle()
@Controller({ path: 'app/readiness', version: '1' })
export class AppReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '首次运行就绪清单（Runtime/DB/AI/Governance/Demo 五维 + 下一步）' })
  async check() {
    return this.readiness.check();
  }
}
