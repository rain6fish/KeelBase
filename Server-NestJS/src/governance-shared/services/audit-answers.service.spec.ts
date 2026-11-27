// SPDX-License-Identifier: Apache-2.0

import { AuditAnswersService } from './audit-answers.service';
import { AUTOMATION_SOURCE } from './audit-export-vocabulary';
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
    /** Rows the approver-name lookup finds: their own `tool_confirmation` row per conversation. */
    approverRows?: Array<Record<string, unknown>>;
  }) {
    const getLogs = jest.fn();
    const logsRepo = { find: jest.fn().mockResolvedValue(evidence?.approverRows ?? []) };
    const service = new AuditAnswersService(
      { getLogs } as never,
      { find: jest.fn().mockResolvedValue(evidence?.claims ?? []) } as never,
      { find: jest.fn().mockResolvedValue(evidence?.effects ?? []) } as never,
      { find: jest.fn().mockResolvedValue(evidence?.confirmations ?? []) } as never,
      logsRepo as never,
    );
    const rows = rowOverrides.map((over) => baseRow(over));
    getLogs.mockResolvedValue(rows);
    return { service, getLogs, logsRepo, rows };
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

  it('a claim_release row is a decision, not "Create event / Executed"', async () => {
    // The row carries the hold's tool for filtering; the export must still say a release happened.
    // A refused release must not read as an executed `create_event`. The third row is the automatic
    // sweep: no username exists, and the cell names the actor kind instead of «Not recorded».
    // 行带占位的工具名是为筛选；导出仍须说「一次释放发生了」。被拒的释放不得读成一次执行过的
    // `create_event`。第三行是自动清扫：没有用户名，该格说主体的种类，而不是「未记录」。
    const { service } = build([
      {
        id: 31,
        action: 'claim_release',
        tool: 'create_event',
        outcome: null,
        username: 'admin',
        detail: 'release write claim #3 (create_event, as user 1) → closed_unknown; note: …',
        releaseLookups: '{"count":0,"askable":true,"items":[]}',
      },
      {
        id: 32,
        action: 'claim_release',
        tool: 'create_event',
        outcome: null,
        username: 'admin',
        detail: 'release refused (stale_view): write claim #3 …',
        releaseLookups: null,
      },
      {
        id: 33,
        action: 'claim_release',
        tool: 'create_event',
        outcome: null,
        username: null,
        userId: 'system:sweep',
        detail: 'release write claim #4 (create_event, as user 1) → released; origin: …',
        releaseLookups: '{"count":1,"askable":true,"items":[]}',
      },
    ]);

    const matrix = await service.export({ limit: 500 }, undefined, reader);

    expect(matrix.rows[0].slice(1, 3)).toEqual(['Write-hold release', 'Result unknown']);
    expect(matrix.rows[1].slice(1, 3)).toEqual(['Write-hold release', 'Rejected']);
    expect(matrix.rows[2][5]).toBe('Automated');
    expect(scanForInternalNames(matrix.rows.flat())).toEqual([]);
  });

  /**
   * R-8, the consistency half: one sweep writes both rows, so a reader must not get two different
   * initiators for the same automated act. The expiry row keeps the operator's name and id (scope
   * needs them); the release row carries a `system:` id. Both cells must read «Automated», and the
   * operator's name must not resurface as the initiator of something they did not do.
   *
   * R-8 的一致性那一半：一次清扫写下两行，读者不能对同一件自动动作得到两个不同的发起人。到期行保留
   * 操作人的姓名与 id（范围需要它们）；释放行带 `system:` 的 id。两格都必须读作「自动」，且操作人的
   * 姓名不得作为一件他没做过的事的发起人再次出现。
   */
  it('one sweep, two rows: the expiry and the release name the same automated initiator', async () => {
    const { service } = build([
      {
        id: 41,
        action: 'tool_confirmation',
        outcome: 'timeout',
        isError: true,
        tool: 'create_event',
        username: 'alice',
        userId: '7',
        conversationId: 'conv-41',
        source: AUTOMATION_SOURCE,
      },
      {
        id: 42,
        action: 'claim_release',
        outcome: null,
        tool: 'create_event',
        username: null,
        userId: 'system:sweep',
        detail: 'release write claim #9 (create_event, as user 7) → released; origin: window closed',
      },
    ]);

    const matrix = await service.export({ limit: 500 }, undefined, reader);

    expect(matrix.rows.map((cells) => cells[5])).toEqual(['Automated', 'Automated']);
    expect(matrix.rows[0][5]).not.toContain('alice');
    expect(scanForInternalNames(matrix.rows.flat())).toEqual([]);
  });

  it('an expiry row reads “Not executed”, while a real failure still reads “Failed”', async () => {
    // R-8 follow-up: the hourly sweep writes `tool_confirmation` + `timeout` for a window that
    // closed with nobody deciding. That is the `not_executed` shape — one fact per cell — and it
    // must not fall through to the generic error word. A row that really ran and broke keeps its
    // own word, so the two are not flattened into one.
    // R-8 后续：整点清扫为「窗口到期、无人裁决」写 `tool_confirmation` + `timeout`，这正是
    // `not_executed` 的形状 —— 一格一个问题 —— 不得落到通用错误词上。真正跑过、坏了的行保留
    // 自己的词，两者不被压平成同一个。
    const { service } = build([
      {
        id: 51,
        action: 'tool_confirmation',
        outcome: 'timeout',
        isError: true,
        tool: 'create_event',
        username: 'alice',
        source: AUTOMATION_SOURCE,
        detail: 'create_event → timeout (offline window closed with no decision)',
      },
      {
        id: 52,
        action: 'tool_call',
        outcome: 'failed',
        isError: true,
        tool: 'create_event',
        username: 'alice',
      },
    ]);

    const matrix = await service.export({ limit: 500 }, undefined, reader);

    expect(matrix.rows[0][2]).toBe('Not executed');
    expect(matrix.rows[1][2]).toBe('Failed');
    expect(scanForInternalNames(matrix.rows.flat())).toEqual([]);
  });

  it('a release says what its newest reading was based on — current state versus receipt', async () => {
    // R-10: the kind already reaches the list projection and the claims read face; the export must
    // carry it too, or a CSV taken away loses the difference between "not there now" and "never
    // accepted". It is read from the off-chain column as data, never from `detail` prose.
    // R-10：种类已经进了列表投影与 claims 读面；导出也必须带上，否则带走的一份 CSV 会丢掉「现在不在」
    // 与「从未被接受」的差别。它读自链外列的数据，绝不解析 `detail` 散文。
    const reading = (basis: string) =>
      JSON.stringify({
        count: 1,
        askable: true,
        items: [
          {
            id: 9,
            at: '2026-11-05T10:00:00.000Z',
            conclusion: 'not_executed',
            reason: null,
            basis,
            lookedUpBy: 'admin',
          },
        ],
      });
    const { service } = build([
      { id: 41, action: 'claim_release', outcome: null, releaseLookups: reading('current_state') },
      { id: 42, action: 'claim_release', outcome: null, releaseLookups: reading('receipt') },
      // A kind this vocabulary does not know is reported as unrecorded, never echoed.
      // 本词表不认识的种类报「未记录」，绝不原样回显。
      { id: 43, action: 'claim_release', outcome: null, releaseLookups: reading('event_log') },
      {
        id: 44,
        action: 'claim_release',
        outcome: null,
        releaseLookups: '{"count":0,"askable":true,"recorded":false,"items":[]}',
      },
      {
        id: 45,
        action: 'claim_release',
        outcome: null,
        releaseLookups: JSON.stringify({
          count: 2,
          askable: true,
          recorded: false,
          items: [
            {
              id: 8,
              at: '2026-11-05T09:00:00.000Z',
              conclusion: 'unknown',
              reason: 'timeout',
              basis: 'receipt',
              lookedUpBy: 'admin',
            },
          ],
        }),
      },
      {
        id: 46,
        action: 'claim_release',
        outcome: null,
        releaseLookups: '{"count":0,"askable":true,"items":[]}',
      },
    ]);

    const matrix = await service.export({ limit: 500 }, undefined, reader);

    expect(matrix.rows[0][2]).toBe(
      'Result unknown — the newest reading is a current-state reading',
    );
    expect(matrix.rows[1][2]).toBe('Result unknown — the newest reading is a receipt reading');
    // The two readings are distinguishable inside the export itself, not by parsing prose.
    // 两种读数在导出文件内部即可区分，不必解析散文。
    expect(matrix.rows[0][2]).not.toBe(matrix.rows[1][2]);
    expect(matrix.rows[2][2]).toBe(
      "Result unknown — the newest reading's kind was not recorded",
    );
    expect(matrix.rows[3][2]).toBe(
      'Result unknown — the target answered; the reading for this ask was not recorded',
    );
    // R-6b residual: the copied item is an earlier ask, so it must not stand in for this one.
    // R-6b 残留：拷贝条目是更早的问次，不得顶替这一次。
    expect(matrix.rows[4][2]).toBe(
      'Result unknown — the newest recorded reading is a receipt reading; ' +
        'the reading for this ask was not recorded',
    );
    // A manual release with no reading keeps the plain state word.
    // 没有读数的人工释放保持纯状态词。
    expect(matrix.rows[5][2]).toBe('Result unknown');
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

  it('a second-person approval names the approver when their decision row is in the conversation', async () => {
    const { service, logsRepo } = build(
      [
        {
          id: 12,
          tool: 'review_approval_request',
          action: 'tool_call',
          outcome: 'executed',
          conversationId: 'conv-12',
        },
      ],
      {
        claims: [{ auditRowId: 12, effectId: 4, authorizationRef: 'tok-2' }],
        effects: [{ id: 4, resultType: 'approval_request', resultId: 77 }],
        confirmations: [{ token: 'tok-2', status: 'approved', approverId: '9' }],
        approverRows: [{ conversationId: 'conv-12', userId: '9', username: 'audit_admin' }],
      },
    );

    const matrix = await service.export({ limit: 500 }, undefined, reader);
    expect(matrix.rows[0][4]).toBe('Approved by audit_admin');
    // A person's account name is not an internal name; the scanner is told which snapshot to allow.
    // 人的账号名不是内部名；扫描器会被告知哪一个是快照姓名。
    expect(
      scanForInternalNames(matrix.rows.flat(), { allowedHumanNames: ['audit_admin'] }),
    ).toEqual([]);
    // One lookup for the whole page, and only the approver's own decision row counts.
    expect(logsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: 'tool_confirmation' }),
      }),
    );
  });

  it('names a second person who declined, from the same decision row', async () => {
    const { service } = build(
      [
        {
          id: 13,
          tool: 'review_approval_request',
          action: 'tool_call',
          outcome: 'not_executed',
          conversationId: 'conv-13',
        },
      ],
      {
        claims: [{ auditRowId: 13, effectId: 6, authorizationRef: 'tok-3' }],
        effects: [{ id: 6, resultType: 'approval_request', resultId: 78 }],
        confirmations: [{ token: 'tok-3', status: 'declined', approverId: '9' }],
        approverRows: [{ conversationId: 'conv-13', userId: '9', username: 'audit_admin' }],
      },
    );

    const matrix = await service.export({ limit: 500 }, undefined, reader);
    expect(matrix.rows[0][4]).toBe('Declined by audit_admin');
  });

  it('names no one when the decision row is missing, or belongs to another conversation', async () => {
    const { service } = build(
      [
        {
          id: 12,
          tool: 'review_approval_request',
          action: 'tool_call',
          outcome: 'executed',
          conversationId: 'conv-12',
        },
      ],
      {
        claims: [{ auditRowId: 12, effectId: 4, authorizationRef: 'tok-2' }],
        effects: [{ id: 4, resultType: 'approval_request', resultId: 77 }],
        confirmations: [{ token: 'tok-2', status: 'approved', approverId: '9' }],
        // The same approver's decision row, but in someone else's conversation: not this approval.
        approverRows: [{ conversationId: 'conv-other', userId: '9', username: 'audit_admin' }],
      },
    );

    const matrix = await service.export({ limit: 500 }, undefined, reader);
    // The deleted-account / missing-row reading: it still says a **second person** approved. It must
    // never read as «Confirmed by alice», which would turn someone else's decision into self-service.
    // 删号 / 缺行的读法：仍说**是第二个人**批准。它绝不能读成「Confirmed by alice」—— 那会把别人的
    // 决定说成本人自己确认。
    expect(matrix.rows[0][4]).toBe('Second-person approval (approver name not recorded)');
    expect(matrix.rows[0][4]).not.toContain('Confirmed by');
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
