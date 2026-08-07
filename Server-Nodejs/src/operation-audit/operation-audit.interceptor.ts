import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { OperationAuditService } from './operation-audit.service';
import { SKIP_AUDIT_KEY } from './skip-audit.decorator';
import { deriveFeature } from './feature-map';
import { redactSensitive } from '../common/utils/mask';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * 全局操作审计拦截器：自动记录所有写方法（POST/PATCH/PUT/DELETE）。
 * 用 @SkipAudit() 排除特定端点；落库失败静默，不阻塞业务。
 */
@Injectable()
export class OperationAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: OperationAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const method = req.method.toUpperCase();
    if (!WRITE_METHODS.has(method)) return next.handle();

    const path = req.originalUrl || req.url;
    const user = (req as any).user;
    const userId = user?.sub ?? null;
    const targetId = this._extractTargetId(req.params);
    const feature = deriveFeature(method, path);

    return next.handle().pipe(
      tap(() => {
        // 异步落库，不阻塞响应；失败静默（审计不影响业务）
        this.auditService.log({
          userId,
          action: this._deriveAction(method, path),
          method,
          path: path.split('?')[0],
          featureKey: feature.key,
          featureFallback: feature.fallback,
          targetId,
          requestBody: this._safeBody(req.body),
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          statusCode: ctx.getResponse().statusCode,
        }).catch(() => undefined);
      }),
    );
  }

  private _extractTargetId(params: Record<string, unknown>): string | null {
    // 常见路径参数：/:id 或 /:id/xxx；取第一个数字/含 id 的参数
    if (!params) return null;
    const idKey = Object.keys(params).find((k) => k === 'id' || k.endsWith('Id'));
    const val = idKey ? params[idKey] : null;
    return val == null ? null : String(val);
  }

  private _deriveAction(method: string, path: string): string {
    const p = path.split('?')[0];
    if (p.endsWith('/auth/login')) return 'LOGIN';
    if (p.endsWith('/auth/logout')) return 'LOGOUT';
    if (p.endsWith('/upload')) return 'UPLOAD';
    switch (method) {
      case 'POST':
        return 'CREATE';
      case 'PATCH':
      case 'PUT':
        return 'UPDATE';
      case 'DELETE':
        return 'DELETE';
      default:
        return method;
    }
  }

  private _safeBody(body: unknown): string | null {
    if (body == null) return null;
    try {
      const json = typeof body === 'string' ? body : JSON.stringify(body);
      // 敏感字段打码（password/token 等），原则 1：审计不落明文个人数据
      return redactSensitive(json);
    } catch {
      return null;
    }
  }
}
