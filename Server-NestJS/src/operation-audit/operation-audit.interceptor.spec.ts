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
    interceptor = new OperationAuditInterceptor(reflector, auditService as any);
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

    await firstValueFrom(interceptor.intercept(mockContext(req), next));

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

  it('skips GET requests', async () => {
    const req = { method: 'GET', originalUrl: '/x', url: '/x', body: null, headers: {}, params: {} };

    await firstValueFrom(interceptor.intercept(mockContext(req), next));

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('skips endpoints marked @SkipAudit()', async () => {
    (reflector as any).getAllAndOverride.mockReturnValue(true);
    const req = { method: 'POST', originalUrl: '/x', url: '/x', body: {}, headers: {}, params: {} };

    await firstValueFrom(interceptor.intercept(mockContext(req), next));

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('does not block response when audit log fails', async () => {
    auditService.log.mockRejectedValue(new Error('db down'));
    const req = { method: 'DELETE', originalUrl: '/api/v1/events/1', url: '/api/v1/events/1', body: {}, headers: {}, params: { id: '1' }, user: { sub: 1 } };

    const result = await firstValueFrom(interceptor.intercept(mockContext(req), next));

    expect(result).toEqual({ ok: true });
  });

  it('derives targetId from path params', async () => {
    const req = { method: 'PATCH', originalUrl: '/api/v1/events/42', url: '/api/v1/events/42', body: {}, headers: {}, params: { id: '42' }, user: { sub: 1 } };

    await firstValueFrom(interceptor.intercept(mockContext(req), next));

    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ targetId: '42', action: 'UPDATE' }));
  });

  it('非写方法（OPTIONS）→ 跳过不审计（WRITE_METHODS 过滤）', async () => {
    const req = { method: 'OPTIONS', originalUrl: '/api/v1/x', url: '/api/v1/x', body: {}, headers: {}, params: {} };

    await firstValueFrom(interceptor.intercept(mockContext(req), next));

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('body 循环引用（JSON.stringify 抛错）→ 审计仍记录且不抛错（_safeBody catch 兜底）', async () => {
    const cyclic: any = { name: 'x' };
    cyclic.self = cyclic;
    const req = { method: 'POST', originalUrl: '/api/v1/events', url: '/api/v1/events', body: cyclic, headers: {}, params: {}, user: { sub: 1 } };

    await expect(firstValueFrom(interceptor.intercept(mockContext(req), next))).resolves.toEqual({ ok: true });
    expect(auditService.log).toHaveBeenCalled();
  });
});
