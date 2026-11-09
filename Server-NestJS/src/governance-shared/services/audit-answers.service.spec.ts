// SPDX-License-Identifier: Apache-2.0

import { AuditAnswersService } from './audit-answers.service';
import type { AiAuditLogWithUser } from './audit-query.service';
import { UserRole } from '../../common/entities/user.entity';
import { scanForInternalNames } from '../../../test/answer-vocabulary-scan';

/**
 * The six answers, built from structured columns only, and the acceptance properties around them:
 * object + period is applied before paging, the CSV has six cells per row, a page that was cut
 * short says so, and **no cell carries an internal name**.
 *
 * 六问，只从结构化列推出；以及围绕它们的验收性质：对象 + 期间在分页之前施加，每行六格，被截断的
 * 一页说出来，且**没有一格带内部名**。
 */
describe('AuditAnswersService', () => {
  const reader = { userId: 7, role: UserRole.AUDITOR };

  function build(rowOverrides: Partial<AiAuditLogWithUser>[] = [], evidence?: {
    claims?: Array<Record<string, unknown>>;
    effects?: Array<Record<string, unknown>>;
    confirmations?: Array<Record<string, unknown>>;
  }) {
    const getLogs = jest.fn();
    const service = new AuditAnswersService(
      { getLogs } as never,
      { find: jest.fn().mockResolvedValue(evidence?.claims ?? []) } as never,
      { find: jest.fn().mockResolvedValue(evidence?.effects ?? []) } as never,
      { find: jest.fn().mockResolvedValue(evidence?.confirmations ?? []) } as never,
    );
    const rows = rowOverrides.map((over) => baseRow(over));
    getLogs.mockResolvedValue(rows);
    return { service, getLogs, rows };
  }

  it('builds six product cells and applies the object ids before paging', async () => {
    const { service, getLogs } = build(
      [{ id: 11, tool: 'create_event', action: 'tool_call', outcome: 'executed' }],
      {
        claims: [{ auditRowId: 11, effectId: 3, authorizationRef: 'tok-1' }],
        effects: [{ id: 3, resultType: 'crm_customer', resultId: 9005, revokeStatus: null }],
        confirmations: [{ token: 'tok-1', status: 'approved', approverId: null }],
      },
    );

    const matrix = await service.export(
      {
        objectType: 'crm_customer',
        objectId: 9005,
        since: new Date('2026-11-05T10:00:00Z'),
        until: new Date('2026-11-05T11:00:00Z'),
        limit: 500,
      },
      [11],
      reader,
    );

    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: [11],
        since: new Date('2026-11-05T10:00:00Z'),
        until: new Date('2026-11-05T11:00:00Z'),
        limit: 501,
      }),
      reader,
    );

    expect(matrix.headers).toHaveLength(6);
    expect(matrix.rows[0]).toEqual([
      '2026-11-05 10:00:00 UTC',
      'Create event',
      'Executed',
      'Customer #9005',
      'Confirmed by alice',
      'alice (through the AI assistant)',
    ]);
    expect(matrix.match).toMatchObject({ found: true, count: 1, truncated: false });
    expect(matrix.match.statement).toBe(
      '1 matching record for Customer #9005 in the selected period.',
    );
    expect(scanForInternalNames(matrix.rows.flat())).toEqual([]);
  });

  it('reads a zone-less database instant as UTC, not as the machine’s local time', async () => {
    // SQLite hands back TypeORM's UTC wall clock without a zone. Parsing it as local is how an
    // export ends up eight hours off on a +08 machine.
    // SQLite 交回的是 TypeORM 的无时区 UTC 墙钟。按本地解析，就是导出在 +08 机器上差八小时的来路。
    const { service } = build([{ id: 21, createdAt: '2026-11-05 10:30:00' }]);
    const matrix = await service.export({ limit: 500 }, undefined, reader);
    expect(matrix.rows[0][0]).toBe('2026-11-05 10:30:00 UTC');
  });

  it('a second-person approval names the person as a gap, not a guess', async () => {
    const { service } = build(
      [{ id: 12, tool: 'review_approval_request', action: 'tool_call', outcome: 'executed' }],
      {
        claims: [{ auditRowId: 12, effectId: 4, authorizationRef: 'tok-2' }],
        effects: [{ id: 4, resultType: 'approval_request', resultId: 77 }],
        confirmations: [{ token: 'tok-2', status: 'approved', approverId: '9' }],
      },
    );

    const matrix = await service.export({ limit: 500 }, undefined, reader);
    expect(matrix.rows[0][4]).toBe('Second-person approval (approver name not recorded)');
    expect(scanForInternalNames(matrix.rows.flat())).toEqual([]);
  });

  it('a blocked row with no claim answers “Not recorded” for the object — the minute’s answer', async () => {
    const { service } = build([
      {
        id: 13,
        tool: 'delete_customer',
        action: 'tool_call',
        outcome: 'blocked',
        isError: true,
        // The deny-reasons shape: an array.
        authorization: JSON.stringify([{ name: 'risk_policy', ok: false }]),
      },
    ]);

    const matrix = await service.export({ limit: 500 }, undefined, reader);
    const cells = matrix.rows[0];
    expect(cells[2]).toBe('Rejected');
    expect(cells[3]).toBe('Not recorded');
    expect(cells[4]).toBe('Refused (no approval recorded)');
    expect(scanForInternalNames(cells)).toEqual([]);
  });

  it('unknown types and tools fall back to generic words, never to their tokens', async () => {
    const { service } = build(
      [{ id: 14, tool: 'brand_new_tool', action: 'tool_call', outcome: 'failed', isError: true }],
      {
        claims: [{ auditRowId: 14, effectId: 5 }],
        effects: [{ id: 5, resultType: 'expense_claims', resultId: 12 }],
      },
    );

    const matrix = await service.export({ limit: 500 }, undefined, reader);
    expect(matrix.rows[0]).toEqual([
      expect.any(String),
      'AI action',
      'Failed',
      'Business record #12',
      'Not recorded',
      'alice (through the AI assistant)',
    ]);
    expect(scanForInternalNames(matrix.rows.flat())).toEqual([]);
  });

  it('says “no match” in words instead of returning a silent empty page', async () => {
    const { service } = build([]);
    const matrix = await service.export(
      { objectType: 'crm_customer', objectId: 9005, limit: 500 },
      [],
      reader,
    );

    expect(matrix.rows).toEqual([]);
    expect(matrix.match).toMatchObject({ found: false, count: 0 });
    expect(matrix.match.statement).toBe('No matching records for Customer #9005.');
  });

  it('a page cut short says so rather than looking complete', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: i + 1 }));
    const { service, getLogs } = build(rows as Partial<AiAuditLogWithUser>[]);

    const matrix = await service.export({ limit: 2 }, undefined, reader);
    expect(getLogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }), reader);
    expect(matrix.rows).toHaveLength(2);
    expect(matrix.match).toMatchObject({ count: 2, truncated: true });
    expect(matrix.match.statement).toContain('Showing the first 2');
  });
});

/** A row shaped like the one the list query hands back. */
function baseRow(over: Partial<AiAuditLogWithUser>): AiAuditLogWithUser {
  return {
    id: 1,
    userId: '7',
    action: 'tool_call',
    isError: false,
    createdAt: '2026-11-05T10:00:00.000Z',
    username: 'alice',
    outcome: 'executed',
    tool: 'create_event',
    authorization: null,
    agentId: null,
    ...over,
  } as AiAuditLogWithUser;
}
