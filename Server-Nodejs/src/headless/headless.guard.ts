import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * AI-19 headless API 守卫：校验 `x-api-key` 请求头与 HEADLESS_API_KEY 匹配。
 * 未配置 HEADLESS_API_KEY 时端点不可用（返回 401）。
 */
@Injectable()
export class HeadlessGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const apiKey = this.configService.get<string>('HEADLESS_API_KEY', '');
    if (!apiKey) {
      throw new UnauthorizedException('headless API 未启用');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.headers['x-api-key'] ?? req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (!key || key !== apiKey) {
      throw new UnauthorizedException('无效的 API Key');
    }
    return true;
  }
}
