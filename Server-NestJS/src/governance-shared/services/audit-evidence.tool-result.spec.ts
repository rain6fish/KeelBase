// SPDX-License-Identifier: Apache-2.0

import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../common/entities/user.entity';
import { AuditEvidenceService } from './audit-evidence.service';

/**
 * The by-id retained-body read shares the same row scope as every other by-id audit surface: out of
 * scope and "no such row" are the same 404, and "nothing was retained" is a 404 as well — only an
 * **expired** body is a 200, because the tombstone is real evidence.
 *
 * 按 id 读取留存正文与其它按 id 的审计读面共用同一行范围：范围外与「没有这一行」同为 404，
 * 「什么都没留」也是 404 —— 只有**已过期**的正文是 200，因为墓碑本身就是证据。
 */
describe('AuditEvidenceService.getToolResultBody', () => {
  const admin = { userId: 1, role: UserRole.ADMIN };
  const reader = { userId: 1, role: UserRole.USER };

  function makeService(
    row: Record<string, unknown> | null,
    body: Record<string, unknown> | null,
  ): { svc: AuditEvidenceService; store: { findOneByAuditRow: jest.Mock } } {
    const logRepo = { findOne: jest.fn().mockResolvedValue(row) };
    const store = { findOneByAuditRow: jest.fn().mockResolvedValue(body) };
    const svc = new AuditEvidenceService(
      logRepo as never,
      {} as never,
      {} as never,
      { forFacts: () => ({}) } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      store as never,
    );
    return { svc, store };
  }

  const toolRow = {
    id: 7,
    action: 'tool_call',
    userId: '42',
    tool: 'query_customers',
    outcome: 'executed',
  };

  const bodyRow = {
    auditRowId: 7,
    toolName: 'query_customers',
    outcome: 'executed',
    bodyState: 'stored',
    bodyText: '{"success":true}',
    bodyBytes: 15,
    storedBytes: 15,
    bodySha256: 'b'.repeat(64),
    originalSha256: 'a'.repeat(64),
    wasTruncated: true,
    modelText: '{"success":true}',
    modelChars: 15,
    modelSha256: 'c'.repeat(64),
    createdAt: new Date('2026-11-14T00:00:00Z'),
    expiresAt: new Date('2026-12-14T00:00:00Z'),
  };

  it('管理员按审计行读到留存正文', async () => {
    const { svc } = makeService(toolRow, bodyRow);
    const out = await svc.getToolResultBody(7, admin);
    expect(out).toMatchObject({
      auditRowId: 7,
      toolName: 'query_customers',
      outcome: 'executed',
      bodyState: 'stored',
      body: '{"success":true}',
      wasTruncated: true,
      modelText: '{"success":true}',
    });
    expect(out.createdAt).toBe('2026-11-14T00:00:00.000Z');
    expect(out.expiresAt).toBe('2026-12-14T00:00:00.000Z');
  });

  it('过期正文：200 语义 + bodyState=expired + 文本为空、墓碑仍在', async () => {
    const { svc } = makeService(toolRow, {
      ...bodyRow,
      bodyState: 'expired',
      bodyText: null,
      storedBytes: null,
      modelText: null,
      modelChars: null,
    });
    const out = await svc.getToolResultBody(7, admin);
    expect(out.bodyState).toBe('expired');
    expect(out.body).toBeNull();
    expect(out.modelText).toBeNull();
    expect(out.bodySha256).toBe('b'.repeat(64));
    expect(out.originalSha256).toBe('a'.repeat(64));
    expect(out.bodyBytes).toBe(15);
  });

  it('非工具调用行 → 404', async () => {
    const { svc } = makeService({ ...toolRow, action: 'chat' }, bodyRow);
    await expect(svc.getToolResultBody(7, admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('没有留存正文 → 404（「未留存」不是空正文）', async () => {
    const { svc } = makeService(toolRow, null);
    await expect(svc.getToolResultBody(7, admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('审计读者范围外 → 404（与「没有这一行」同一个答案）', async () => {
    const { svc } = makeService({ ...toolRow, userId: '99' }, bodyRow);
    await expect(svc.getToolResultBody(7, reader)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('审计读者本人行可读', async () => {
    const { svc } = makeService({ ...toolRow, userId: '1' }, bodyRow);
    await expect(svc.getToolResultBody(7, reader)).resolves.toMatchObject({ auditRowId: 7 });
  });
});
