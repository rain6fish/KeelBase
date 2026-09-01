// SPDX-License-Identifier: Apache-2.0

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/guards/public.decorator';
import { AppVersionService } from './app-version.service';

@ApiTags('版本检查')
@SkipThrottle()
@Controller({ path: 'app/version', version: '1' })
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '获取应用最新版本元数据' })
  getVersionInfo() {
    return this.appVersionService.getVersionInfo();
  }
}
