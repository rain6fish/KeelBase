// SPDX-License-Identifier: Apache-2.0

import { UserRole } from '../../common/entities/user.entity';
import {
  AUDIT_READER_ENTITY_FIELDS,
  AUDIT_READER_ROW_FIELDS,
  projectAuditEntityForCaller,
  projectAuditRowForReader,
  projectAuditRowsForCaller,
} from './audit-reader-projection';
import type { AiAuditLogWithUser } from './audit-query.service';

/**
 * AW-2 field whitelist. The point of these tests is the **default**: a field that exists on the row
 * but is not on the list must not come out of the projection — including a field nobody has written
 * a rule for yet. The last test simulates exactly that by adding an unseen key at runtime.
 *
 * AW-2 字段白名单。这些用例测的是**默认值**：行上有、清单上没有的字段，不得从投影里出来 —— 包括
 * 一个还没人为它写过规则的字段。最后一条用例正是这么做的：运行时塞一个没见过的键。
 */
describe('audit reader projection', () => {
  const fullRow = {
    id: 1,
    userId: '5',
    username: 'alice',
    conversationId: 'conv-1',
    action: 'tool_call',
    detail: 'create_todo',
    actionKey: 'tool_call',
    actionLabel: '调用工具 create_todo',
    agentId: 'sales-agent',
    parentActionId: null,
    callerAgentId: null,
    delegationContext: 'user asked me to do X',
    businessIntent: 'create todo',
    source: 'web',
    ip: '10.0.0.1',
    guestId: 'visitor-1',
    deviceId: 'device-1',
    outcome: 'executed',
    tool: 'create_todo',
    model: 'deepseek',
    provider: 'deepseek',
    promptTokens: 10,
    completionTokens: 5,
    durationMs: 20,
    isError: false,
    errorMessage: null,
    authorization: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    businessEvent: null,
    evidence: null,
    feedback: 'thumbs_up',
    feedbackNote: 'thanks',
  } as unknown as AiAuditLogWithUser;

  it('keeps the fields an audit reader needs', () => {
    const projected = projectAuditRowForReader(fullRow);
    expect(projected).toMatchObject({
      id: 1,
      userId: '5',
      username: 'alice',
      action: 'tool_call',
      actionKey: 'tool_call',
      actionLabel: '调用工具 create_todo',
      agentId: 'sales-agent',
      outcome: 'executed',
      tool: 'create_todo',
      isError: false,
      createdAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('drops attribution identifiers and conversation/feedback columns', () => {
    const projected = projectAuditRowForReader(fullRow) as Record<string, unknown>;
    for (const hidden of [
      'conversationId',
      'ip',
      'guestId',
      'deviceId',
      'delegationContext',
      'feedback',
      'feedbackNote',
    ]) {
      expect(projected).not.toHaveProperty(hidden);
    }
  });

  it('fail-closed: a field added to the row tomorrow is not visible until it is added to the list', () => {
    const futureRow = { ...fullRow, someNewColumn: 'secret-later' } as unknown as AiAuditLogWithUser;
    const projected = projectAuditRowForReader(futureRow) as Record<string, unknown>;
    expect(projected).not.toHaveProperty('someNewColumn');
    // And this is why: the projection is built **from** the list, so the list is the whole decision.
    // 理由就在这里：投影是**从**清单重建的，故清单就是全部的决定。
    expect(AUDIT_READER_ROW_FIELDS as readonly string[]).not.toContain('someNewColumn');
  });

  it('admin keeps the whole row; an auditor — or an unidentified caller — gets the projection', () => {
    expect(projectAuditRowsForCaller([fullRow], UserRole.ADMIN)[0]).toBe(fullRow);
    expect(projectAuditRowsForCaller([fullRow], UserRole.AUDITOR)[0]).not.toBe(fullRow);
    expect(projectAuditRowsForCaller([fullRow], undefined)[0]).not.toBe(fullRow);
  });

  it('the explanation row follows the same rule and keeps the chain position', () => {
    const entity = {
      ...fullRow,
      sessionId: 'session-1',
      prevHash: 'prev',
      hash: 'hash',
      payloadVersion: 2,
    };
    const projected = projectAuditEntityForCaller(entity as never, UserRole.AUDITOR) as Record<
      string,
      unknown
    >;

    expect(projected).toMatchObject({ id: 1, username: 'alice', prevHash: 'prev', hash: 'hash' });
    for (const hidden of ['ip', 'guestId', 'deviceId', 'conversationId', 'sessionId', 'payloadVersion']) {
      expect(projected).not.toHaveProperty(hidden);
    }
    expect(AUDIT_READER_ENTITY_FIELDS as readonly string[]).not.toContain('someNewColumn');
  });
});
