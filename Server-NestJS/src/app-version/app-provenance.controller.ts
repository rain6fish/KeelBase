// SPDX-License-Identifier: Apache-2.0

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/guards/public.decorator';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AiService } from '../ai/ai.service';
import { MODULES_MANIFEST } from '../common/modules/modules-manifest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Runtime provenance（来源指纹，§13.1 后置项① / 公开命名非 DNA）：
 * 机器可读「这是什么系统」——静态来源身份（.keelbase/manifest.json）+ 运行时能力（preset/模块）+ AI 工具指纹。
 * 面向合成陌生人 / AI Bridge / 外部开发者 onboarding，与 `keelbase inspect`（Build 侧 CLI）互补。
 * 不暴露工具参数/权限详情（admin 专属 GET /ai/tools），仅汇总指纹。
 */
@ApiTags('来源指纹')
@SkipThrottle()
@Controller({ path: 'app/provenance', version: '1' })
export class AppProvenanceController {
  constructor(
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly aiService: AiService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '运行时来源指纹：来源身份 + 能力清单 + AI 工具指纹（公开，onboarding）' })
  getProvenance() {
    const flags = this.featureFlagsService.getFlags();
    const businessModules = MODULES_MANIFEST.filter(
      (m) => m.category === 'business',
    )
      .filter((m) => flags[m.id as keyof typeof flags] !== false)
      .map((m) => ({ id: m.id, label: m.label, description: m.description }));

    return {
      source: this._readManifest(),
      runtime: {
        preset: this.featureFlagsService.getPreset(),
        businessModules,
        aiToolFingerprint: this.aiService.getToolFingerprint(),
      },
    };
  }

  /** 读仓库 .keelbase/manifest.json（Build 侧来源身份）；缺失/不可读 → manifestPresent:false */
  private _readManifest(): Record<string, unknown> {
    const candidates = [
      resolve(process.cwd(), '../.keelbase/manifest.json'),
      resolve(process.cwd(), '.keelbase/manifest.json'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        try {
          const manifest = JSON.parse(readFileSync(p, 'utf8'));
          return { manifestPresent: true, ...manifest };
        } catch {
          return { manifestPresent: true };
        }
      }
    }
    return { manifestPresent: false };
  }
}
