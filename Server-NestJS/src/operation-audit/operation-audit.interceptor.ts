// SPDX-License-Identifier: Apache-2.0

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { OperationAuditService } from './operation-audit.service';
import { SKIP_AUDIT_KEY } from './skip-audit.decorator';
import { deriveFeature } from './feature-map';
import { deriveBusinessEvent } from './business-event';
import { redactSensitive } from '../common/utils/mask';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** §22.16 A-1 REST 资源路径 → 本地实体名（PATCH/PUT 变更前快照查询用；按优先级先精确后兜底） */
const RESOURCE_ENTITY: Array<[RegExp, string]> = [
  [/\/crm\/customers\/\d+\/opportunities/, 'CrmOpportunity'],
  [/\/crm\/customers\/\d+\/contacts/, 'CrmContact'],
  [/\/crm\/customers\/\d+\/risks/, 'CrmRisk'],
  [/\/crm\/customers\/\d+\/orders/, 'CrmOrder'],
  [/\/crm\/customers\/\d+\/activities/, 'CrmActivity'],
  [/\/org\/organizations\/\d+\/invites/, 'OrganizationInvite'],
  [/\/org\/organizations\/\d+\/members/, 'OrganizationMember'],
  [/\/org\/organizations\/\d+\/departments/, 'Department'],
  [/\/crm\/customers/, 'CrmCustomer'],
  [/\/crm\/tasks/, 'CrmTask'],
  [/\/pm\/projects/, 'PmProject'],
  [/\/pm\/tasks/, 'PmTask'],
  [/\/approval\/requests/, 'ApprovalRequest'],
  [/\/events/, 'Event'],
  [/\/todos/, 'Todo'],
  [/\/users/, 'User'],
];

function resourceEntity(path: string): string | null {
  const p = path.split('?')[0];
  for (const [re, entity] of RESOURCE_ENTITY) {
    if (re.test(p)) return entity;
  }
  return null;
}

/**
 * 全局操作审计拦截器：自动记录所有写方法（POST/PATCH/PUT/DELETE）。
 * 用 @SkipAudit() 排除特定端点；落库失败静默，不阻塞业务。
 */
@Injectable()
export class OperationAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: OperationAuditService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
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
    const businessEvent = deriveBusinessEvent(path, method);

    // §22.16 A-1 字段级 diff：PATCH/PUT + 可解析资源 → 执行前查 before（变更前状态）；查询失败降级 null
    let before: Record<string, unknown> | null = null;
    if (method === 'PATCH' || method === 'PUT') {
      const entity = resourceEntity(path);
      if (entity && targetId) {
        try {
          const repo = this.dataSource.getRepository(entity);
          const row = await repo.findOne({ where: { id: Number(targetId) } } as any);
          if (row) before = this._sanitizeForAudit(row);
        } catch {
          before = null;
        }
      }
    }

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
          // §22.16 A-1 字段级变更留痕：有 before → 真 diff（[{field,before,after}]）；无 before 退化记录 after 值
          changes: this._extractChanges(req.body, before),
          businessEvent,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          statusCode: ctx.getResponse().statusCode,
        }).catch(() => undefined);
      }),
    );
  }

  /** §22.16 A-1 before 快照清洗：排除 id/审计列/敏感键，嵌套对象忽略（与 _extractChanges 字段级口径一致） */
  private _sanitizeForAudit(row: Record<string, unknown>): Record<string, unknown> {
    const SKIP = new Set(['id', 'createdAt', 'updatedAt', 'password', 'refreshTokenHash', 'loginAttempts', 'lockedUntil', 'prevHash', 'hash']);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (SKIP.has(k) || v == null || typeof v === 'object') continue;
      out[k] = /password|token|secret|refresh/i.test(k) ? '[REDACTED]' : String(v);
    }
    return out;
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
        // WRITE_METHODS 过滤保证只有 POST/PATCH/PUT/DELETE 会走到这，default 防御性不可达
        /* istanbul ignore next */
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

  /** A-1 字段级变更留痕：从请求体提取「变更字段 → after 值」，生成 [{ field, before, after }] JSON。before 精确值经实体快照增强，首增量标 null。 */
  private _extractChanges(body: unknown, before?: Record<string, unknown> | null): string | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const SKIP = new Set(['password', 'refreshToken', 'createdAt', 'updatedAt', 'id']);
    const entries: Array<{ field: string; before: string | null; after: string }> = [];
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (SKIP.has(k)) continue;
      if (v == null || typeof v === 'object') continue; // 忽略 null/嵌套对象（首增量）
      const afterStr = String(v);
      const beforeVal = before?.[k];
      // §22.16 A-1：有 before → 仅变化字段（真 diff）；无 before → 记录 after 值（首增量）
      if (before !== null && before !== undefined && beforeVal !== undefined) {
        const beforeStr = String(beforeVal);
        if (beforeStr === afterStr) continue;
        entries.push({ field: k, before: beforeStr, after: afterStr });
      } else {
        entries.push({ field: k, before: null, after: afterStr });
      }
    }
    if (!entries.length) return null;
    return JSON.stringify(entries);
  }
}
