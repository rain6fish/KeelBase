// SPDX-License-Identifier: Apache-2.0

import { Reflector } from '@nestjs/core';
import { of, firstValueFrom } from 'rxjs';
import { OperationAuditInterceptor } from './operation-audit.interceptor';
import { OperationAuditService } from './operation-audit.service';
import { SKIP_AUDIT_KEY } from './skip-audit.decorator';

describe('OperationAuditInterceptor', () => {
  let interceptor: OperationAuditInterceptor;
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  function mockContext(req: any) {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ statusCode: 200 }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  const next = { handle: () => of({ ok: true }) };

  beforeEach(() => {
    jest.clearAllMocks();
    (reflector as any).getAllAndOverride.mockReturnValue(false);
    interceptor = new OperationAuditInterceptor(
      reflector,
      auditService as any,
      // §internal.16 A-1 before 查询：默认无行（before null → 退化记录 after 值）
      { getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }) } as any,
    );
  });

  it('records a write request (POST)', async () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/events',
      url: '/api/v1/events',
      body: { title: 'X' },
      ip: '1.1.1.1',
      headers: { 'user-agent': 'ua' },
      params: {},
      user: { sub: 5 },
    };

    await firstValueFrom(await interceptor.intercept(mockContext(req), next));

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 5,
        action: 'CREATE',
        method: 'POST',
        path: '/api/v1/events',
        requestBody: '{"title":"X"}',
        ip: '1.1.1.1',
        statusCode: 200,
      }),
    );
  });

  it('A-1 captures field changes + business event on PATCH', async () => {
    const req = {
      method: 'PATCH',
      originalUrl: '/api/v1/crm/customers/3',
      url: '/api/v1/crm/customers/3',
      body: { status: 'active', riskLevel: 'high' },
      ip: '1.1.1.1',
      headers: {},
      params: { id: '3' },
      user: { sub: 5 },
    };

    await firstValueFrom(await interceptor.intercept(mockContext(req), next));

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        businessEvent: 'CustomerUpdated',
        changes: JSON.stringify([
          { field: 'status', before: null, after: 'active' },
          { field: 'riskLevel', before: null, after: 'high' },
        ]),
      }),
    );
  });

  it('A-1 skips sensitive/noise fields in changes', async () => {
    const req = {
      method: 'PUT',
      originalUrl: '/api/v1/users/7',
      url: '/api/v1/users/7',
      body: { nickname: 'New', password: 'secret', createdAt: '2026-01-01', id: 7 },
      ip: '1.1.1.1',
      headers: {},
      params: { id: '7' },
      user: { sub: 5 },
    };

    await firstValueFrom(await interceptor.intercept(mockContext(req), next));

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        businessEvent: 'UserUpdated',
        changes: JSON.stringify([{ field: 'nickname', before: null, after: 'New' }]),
      }),
    );
  });

  it('skips GET requests', async () => {
    const req = { method: 'GET', originalUrl: '/x', url: '/x', body: null, headers: {}, params: {} };

    await firstValueFrom(await interceptor.intercept(mockContext(req), next));

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('skips endpoints marked @SkipAudit()', async () => {
    (reflector as any).getAllAndOverride.mockReturnValue(true);
    const req = { method: 'POST', originalUrl: '/x', url: '/x', body: {}, headers: {}, params: {} };

    await firstValueFrom(await interceptor.intercept(mockContext(req), next));

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('does not block response when audit log fails', async () => {
    auditService.log.mockRejectedValue(new Error('db down'));
    const req = { method: 'DELETE', originalUrl: '/api/v1/events/1', url: '/api/v1/events/1', body: {}, headers: {}, params: { id: '1' }, user: { sub: 1 } };

    const result = await firstValueFrom(await interceptor.intercept(mockContext(req), next));

    expect(result).toEqual({ ok: true });
  });

  it('derives targetId from path params', async () => {
    const req = { method: 'PATCH', originalUrl: '/api/v1/events/42', url: '/api/v1/events/42', body: {}, headers: {}, params: { id: '42' }, user: { sub: 1 } };

    await firstValueFrom(await interceptor.intercept(mockContext(req), next));

    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ targetId: '42', action: 'UPDATE' }));
  });

  it('非写方法（OPTIONS）→ 跳过不审计（WRITE_METHODS 过滤）', async () => {
    const req = { method: 'OPTIONS', originalUrl: '/api/v1/x', url: '/api/v1/x', body: {}, headers: {}, params: {} };

    await firstValueFrom(await interceptor.intercept(mockContext(req), next));

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('body 循环引用（JSON.stringify 抛错）→ 审计仍记录且不抛错（_safeBody catch 兜底）', async () => {
    const cyclic: any = { name: 'x' };
    cyclic.self = cyclic;
    const req = { method: 'POST', originalUrl: '/api/v1/events', url: '/api/v1/events', body: cyclic, headers: {}, params: {}, user: { sub: 1 } };

    await expect(firstValueFrom(await interceptor.intercept(mockContext(req), next))).resolves.toEqual({ ok: true });
    expect(auditService.log).toHaveBeenCalled();
  });

  describe('A-1 before 快照（PATCH/PUT 字段级 diff）', () => {
    function interceptorWithRepo(repo: { findOne: jest.Mock }) {
      return new OperationAuditInterceptor(
        reflector,
        auditService as any,
        { getRepository: jest.fn().mockReturnValue(repo) } as any,
      );
    }

    it('带 before 快照 → 真 diff + 敏感字段打码（[REDACTED]）', async () => {
      const ic = interceptorWithRepo({
        findOne: jest.fn().mockResolvedValue({
          id: 3,
          status: 'lead',
          riskLevel: 'low',
          title: 'Acme',
          apiToken: 'secret-tok',
          password: 'x',
          refreshTokenHash: 'y',
          createdAt: new Date(),
        }),
      });
      const req = {
        method: 'PATCH',
        originalUrl: '/api/v1/crm/customers/3',
        url: '/api/v1/crm/customers/3',
        body: { status: 'active', riskLevel: 'high', title: 'Acme' },
        ip: '1.1.1.1',
        headers: {},
        params: { id: '3' },
        user: { sub: 5 },
      };

      await firstValueFrom(await ic.intercept(mockContext(req), next));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: JSON.stringify([
            { field: 'status', before: 'lead', after: 'active' },
            { field: 'riskLevel', before: 'low', after: 'high' },
          ]),
        }),
      );
    });

    it('before 快照的 PII 明文被打码 —— 旧实现只用 password|token|secret|refresh, 邮箱/手机号会漏进 changes', async () => {
      // The fragment half of the predicate (names like apiToken / resetTokenHash) is pinned by the
      // isSensitiveKey cases in mask.spec; what is pinned here is the wiring — the interceptor really
      // goes through the shared predicate, and the PII names no longer slip past it.
      // 片段名那一半（apiToken / resetTokenHash 之类）由 mask.spec 的 isSensitiveKey 用例钉住；
      // 这里钉的是接线：拦截器确实走共享判据，且 PII 名不再漏。
      const ic = interceptorWithRepo({
        findOne: jest.fn().mockResolvedValue({
          id: 7,
          status: 'active',
          email: 'alice@example.com',
          phone: '13800138000',
        }),
      });
      const req = {
        method: 'PATCH',
        originalUrl: '/api/v1/crm/customers/7',
        url: '/api/v1/crm/customers/7',
        body: { email: 'bob@example.com', phone: '13900139000', status: 'inactive' },
        ip: '1.1.1.1',
        headers: {},
        params: { id: '7' },
        user: { sub: 5 },
      };

      await firstValueFrom(await ic.intercept(mockContext(req), next));

      const calls = (auditService.log as jest.Mock).mock.calls;
      const logged = calls[calls.length - 1][0];
      const entries = JSON.parse(logged.changes) as Array<{ field: string; before: string; after: string }>;
      const byField = Object.fromEntries(entries.map((e) => [e.field, e]));
      // Both sides record that it changed, neither records a value.
      // 两侧都留痕不留值。
      expect(byField.email).toEqual({ field: 'email', before: '[REDACTED]', after: '[REDACTED]' });
      expect(byField.phone).toEqual({ field: 'phone', before: '[REDACTED]', after: '[REDACTED]' });
      // Neither the old nor the new value appears in clear text.
      // 新旧两值都不以明文出现。
      for (const leaked of ['alice@example.com', '13800138000', 'bob@example.com', '13900139000']) {
        expect(logged.changes).not.toContain(leaked);
      }
      // A non-sensitive field still records both values truthfully.
      // 非敏感字段照旧如实留痕（前后两值都在）。
      expect(byField.status).toEqual({ field: 'status', before: 'active', after: 'inactive' });
    });

    it('未变化的敏感字段不产生 diff —— 拿打码值去比明文会凭空造出一条带明文的 diff', async () => {
      const ic = interceptorWithRepo({
        findOne: jest.fn().mockResolvedValue({ id: 8, email: 'same@example.com', status: 'active' }),
      });
      const req = {
        method: 'PATCH',
        originalUrl: '/api/v1/crm/customers/8',
        url: '/api/v1/crm/customers/8',
        body: { email: 'same@example.com', status: 'inactive' },
        ip: '1.1.1.1',
        headers: {},
        params: { id: '8' },
        user: { sub: 5 },
      };

      await firstValueFrom(await ic.intercept(mockContext(req), next));

      const calls = (auditService.log as jest.Mock).mock.calls;
      const logged = calls[calls.length - 1][0];
      const entries = JSON.parse(logged.changes) as Array<{ field: string }>;
      expect(entries.map((e) => e.field)).toEqual(['status']);
      expect(logged.changes).not.toContain('same@example.com');
    });

    it('before 查询抛错 → 降级 null（catch 不阻塞）', async () => {
      const ic = interceptorWithRepo({ findOne: jest.fn().mockRejectedValue(new Error('db down')) });
      const req = {
        method: 'PUT',
        originalUrl: '/api/v1/events/9',
        url: '/api/v1/events/9',
        body: { title: 'New' },
        ip: '1.1.1.1',
        headers: {},
        params: { id: '9' },
        user: { sub: 1 },
      };

      await firstValueFrom(await ic.intercept(mockContext(req), next));

      expect(auditService.log).toHaveBeenCalled();
    });

    it('非资源路径（无实体映射）→ 不查 before 仍记录', async () => {
      const ic = interceptorWithRepo({ findOne: jest.fn().mockResolvedValue({ id: 5, name: 'X' }) });
      const req = {
        method: 'PATCH',
        originalUrl: '/api/v1/contracts/5',
        url: '/api/v1/contracts/5',
        body: { name: 'New' },
        ip: '1.1.1.1',
        headers: {},
        params: { id: '5' },
        user: { sub: 1 },
      };

      await firstValueFrom(await ic.intercept(mockContext(req), next));

      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ targetId: '5' }));
    });
  });

  describe('approval 审批动作入审计（decide/review 语义，非误记 Created）', () => {
    it('decide approve → action DECIDE + ApprovalRequestApproved', async () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/v1/approval/requests/3/decide',
        url: '/api/v1/approval/requests/3/decide',
        body: { decision: 'approve' },
        ip: '1.1.1.1',
        headers: {},
        params: { id: '3' },
        user: { sub: 5 },
      };

      await firstValueFrom(await interceptor.intercept(mockContext(req), next));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DECIDE', businessEvent: 'ApprovalRequestApproved' }),
      );
    });

    it('decide reject → action DECIDE + ApprovalRequestRejected', async () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/v1/approval/requests/3/decide',
        url: '/api/v1/approval/requests/3/decide',
        body: { decision: 'reject' },
        ip: '1.1.1.1',
        headers: {},
        params: { id: '3' },
        user: { sub: 5 },
      };

      await firstValueFrom(await interceptor.intercept(mockContext(req), next));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DECIDE', businessEvent: 'ApprovalRequestRejected' }),
      );
    });

    it('review → action REVIEW + ApprovalRequestReviewed', async () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/v1/approval/requests/3/review',
        url: '/api/v1/approval/requests/3/review',
        body: {},
        ip: '1.1.1.1',
        headers: {},
        params: { id: '3' },
        user: { sub: 5 },
      };

      await firstValueFrom(await interceptor.intercept(mockContext(req), next));

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REVIEW', businessEvent: 'ApprovalRequestReviewed' }),
      );
    });
  });
});
