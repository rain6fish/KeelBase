// SPDX-License-Identifier: Apache-2.0

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { HeadlessKeysService } from './headless-keys.service';

/**
 * HS-4 headless API 守卫：校验 `x-api-key`（入库 key 或兼容 HEADLESS_API_KEY env）。
 * 校验通过后把 key 上下文挂到 request.headlessKey，controller 用它作为执行身份。
 */
@Injectable()
export class HeadlessGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly keysService: HeadlessKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { headlessKey?: unknown }>();
    const xKey = req.headers['x-api-key'];
    const rawKey = Array.isArray(xKey) ? xKey[0] : xKey;
    const authHeader = req.headers['authorization'];
    const bearerKey = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const key = rawKey ?? bearerKey?.replace(/^Bearer\s+/i, '');
    if (!key) {
      throw new UnauthorizedException('缺少 API Key');
    }
    const envKey = this.configService.get<string>('HEADLESS_API_KEY', '');
    // env 未配置且库内无 key → 端点不可用
    if (!envKey && !(await this._hasStoredKeys())) {
      throw new UnauthorizedException('headless API 未启用');
    }
    try {
      const ctx = await this.keysService.authenticate(key, envKey);
      req.headlessKey = ctx;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('无效的 API Key');
    }
  }

  private async _hasStoredKeys(): Promise<boolean> {
    try {
      return await this.keysService.hasStoredKeys();
    } catch {
      return false;
    }
  }
}
