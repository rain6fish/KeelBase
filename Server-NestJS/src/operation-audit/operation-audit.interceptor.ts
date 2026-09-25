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
import { isSensitiveKey, redactSensitive } from '../common/utils/mask';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// The placeholder an audit row shows in place of a sensitive value — one spelling for both the
// before-snapshot and `changes`, so whoever reads the audit recognises it at a glance.
// 审计里敏感值的占位符 —— before 快照与 changes 共用一个写法，读审计的人一眼就能认出。
const REDACTED = '[REDACTED]';

/** §internal.16 A-1 REST 资源路径 → 本地实体名（PATCH/PUT 变更前快照查询用；按优先级先精确后兜底） */
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
    // approval 审批动作（decide/review）业务事件细分（decision 需读 body）——优先于纯 path+method 派生，避免误记 Created
    const businessEvent = this._deriveApprovalBusinessEvent(path, method, req.body) ?? deriveBusinessEvent(path, method);

    // §internal.16 A-1 字段级 diff：PATCH/PUT + 可解析资源 → 执行前查 before（变更前状态）；查询失败降级 null
    let before: Record<string, unknown> | null = null;
    if (method === 'PATCH' || method === 'PUT') {
      const entity = resourceEntity(path);
      if (entity && targetId) {
        try {
          const repo = this.dataSource.getRepository(entity);
          const row = await repo.findOne({ where: { id: Number(targetId) } } as any);
          if (row) before = this._snapshotForDiff(row);
        } catch {
          before = null;
        }
      }
    }

    return next.handle().pipe(
      tap(() => {
        const statusCode = ctx.getResponse().statusCode;
        const role = (user as { role?: string } | undefined)?.role ?? null;
        // G-1（§internal.17 ① G-1）：事件时点授权依据快照——「人类这条写凭什么允许/是否成」（CASL 角色作用域 + 行级由 handler 强制）；链外注解
        const authorization = JSON.stringify({
          allowed: statusCode < 400,
          role,
          basis: role === 'admin' ? 'casl:manage-all' : 'casl:own-scope(handler-enforced)',
          feature: feature.key ?? null,
          statusCode,
        });
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
          // §internal.16 A-1 字段级变更留痕：有 before → 真 diff（[{field,before,after}]）；无 before 退化记录 after 值
          changes: this._extractChanges(req.body, before),
          businessEvent,
          authorization,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          statusCode,
        }).catch(() => undefined);
      }),
    );
  }

  /**
   * The before-snapshot's comparable fields (§internal.16 A-1): id/audit columns and nested objects
   * dropped, the rest kept **raw**.
   *
   * Masking is deliberately not done here — the diff has to compare raw values to tell whether a
   * field changed, and masked-then-compared makes an **unchanged** sensitive field differ from its
   * plaintext `after`, inventing a diff that carries the plain text. Masking happens on output in
   * `_extractChanges`, the one path that reaches the audit row.
   *
   * before 快照的可比字段（§internal.16 A-1）：排除 id/审计列与嵌套对象，其余**保留原值**。
   *
   * 这里刻意不打码。diff 必须拿原值判「变没变」—— 先打码再比较，一个**没变的**敏感字段会与明文的
   * after 不等，凭空产出一条 diff，而那条 diff 里恰好带着明文。打码改在 `_extractChanges` 输出时做，
   * 那是唯一落到审计行的出口。
   */
  private _snapshotForDiff(row: Record<string, unknown>): Record<string, unknown> {
    const SKIP = new Set(['id', 'createdAt', 'updatedAt', 'password', 'refreshTokenHash', 'loginAttempts', 'lockedUntil', 'prevHash', 'hash']);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (SKIP.has(k) || v == null || typeof v === 'object') continue;
      out[k] = v;
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
    // approval 审批动作（decide/review）是业务决策而非资源创建——语义对齐（Approval 入审计）
    if (/\/approval\/requests\/\d+\/(decide|review)$/.test(p)) {
      return p.endsWith('/decide') ? 'DECIDE' : 'REVIEW';
    }
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

  /** approval 审批动作业务事件细分：decide 依 decision（approve/reject）分派；review=Reviewed。读 body 故在此特例，不污染纯 path+method 的 deriveBusinessEvent。 */
  private _deriveApprovalBusinessEvent(path: string, method: string, body: unknown): string | null {
    if (method !== 'POST') return null;
    const p = path.split('?')[0];
    if (/\/approval\/requests\/\d+\/decide$/.test(p)) {
      const decision = (body as { decision?: string } | null)?.decision;
      if (decision === 'approve') return 'ApprovalRequestApproved';
      if (decision === 'reject') return 'ApprovalRequestRejected';
      return 'ApprovalRequestDecided';
    }
    if (/\/approval\/requests\/\d+\/review$/.test(p)) return 'ApprovalRequestReviewed';
    return null;
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
      // A sensitive field leaves the fact that it changed, never its values: the change test uses
      // raw values, everything written into `changes` is [REDACTED].
      // 敏感字段留痕不留值：判「变没变」用原值，写进 changes 的一律 [REDACTED]。
      const shown = (s: string) => (isSensitiveKey(k) ? REDACTED : s);
      // §internal.16 A-1：有 before → 仅变化字段（真 diff）；无 before → 记录 after 值（首增量）
      if (before !== null && before !== undefined && beforeVal !== undefined) {
        const beforeStr = String(beforeVal);
        if (beforeStr === afterStr) continue;
        entries.push({ field: k, before: shown(beforeStr), after: shown(afterStr) });
      } else {
        entries.push({ field: k, before: null, after: shown(afterStr) });
      }
    }
    if (!entries.length) return null;
    return JSON.stringify(entries);
  }
}
