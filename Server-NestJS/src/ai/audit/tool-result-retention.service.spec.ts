// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'crypto';
import { ToolResultRetentionService } from './tool-result-retention.service';
import { ToolPresentationService } from '../tools/tool-presentation.service';

const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

function makeService(
  store: { saveIfAbsent: jest.Mock },
  overrides: Record<string, unknown> = {},
): ToolResultRetentionService {
  const values: Record<string, unknown> = {
    TOOL_RESULT_BODY_RETENTION_DAYS: 30,
    TOOL_RESULT_BODY_MAX_BYTES: 262144,
    TOOL_RESULT_BODY_SCOPE: 'truncated',
    ...overrides,
  };
  const config = { get: (key: string, def: unknown) => values[key] ?? def };
  const presentation = new ToolPresentationService({} as never, {} as never);
  return new ToolResultRetentionService(config as never, store as never, presentation);
}

const bigResult = {
  success: true,
  data: Array.from({ length: 30 }, (_, i) => ({
    id: i,
    name: `customer-${i}`,
    email: `user${i}@example.com`,
    note: 'x'.repeat(200),
  })),
};

const smallResult = {
  success: true,
  data: { id: 1, email: 'alice@example.com', note: 'hello' },
};

describe('ToolResultRetentionService', () => {
  it('days=0 关闭留存：不写任何行', async () => {
    const store = { saveIfAbsent: jest.fn() };
    const svc = makeService(store, { TOOL_RESULT_BODY_RETENTION_DAYS: 0 });
    await svc.capture({
      auditRowId: 7,
      userId: '42',
      toolName: 'query_customers',
      result: bigResult,
    });
    expect(store.saveIfAbsent).not.toHaveBeenCalled();
  });

  it('默认 truncated：未发生截断的小结果不留存', async () => {
    const store = { saveIfAbsent: jest.fn() };
    const svc = makeService(store);
    await svc.capture({
      auditRowId: 7,
      userId: '42',
      toolName: 'query_customers',
      result: smallResult,
    });
    expect(store.saveIfAbsent).not.toHaveBeenCalled();
  });

  it('被截断的调用：留完整正文（键级 + 字符串级脱敏）、字节数、双哈希、模型实收文本', async () => {
    const store = { saveIfAbsent: jest.fn() };
    const svc = makeService(store);
    const presentation = new ToolPresentationService({} as never, {} as never);
    const rendered = presentation.renderToolResult(bigResult);

    await svc.capture({
      auditRowId: 7,
      conversationId: 'c1',
      userId: '42',
      toolName: 'query_customers',
      result: bigResult,
      rendered,
    });

    expect(store.saveIfAbsent).toHaveBeenCalledTimes(1);
    const row = store.saveIfAbsent.mock.calls[0][0];
    expect(row).toMatchObject({
      auditRowId: 7,
      conversationId: 'c1',
      userId: '42',
      toolName: 'query_customers',
      outcome: 'executed',
      bodyState: 'stored',
      wasTruncated: true,
    });
    expect(row.bodyBytes).toBeGreaterThan(4000);
    expect(row.bodyText).toContain('[REDACTED]');
    expect(row.bodyText).not.toContain('user0@example.com');
    expect(row.bodySha256).toBe(sha256(row.bodyText));
    expect(row.originalSha256).toBe(sha256(rendered.fullJson));
    // 模型实收的那份是原样保留的（字符串级脱敏），用于逐字节核对。
    expect(row.modelText).toBe(rendered.text);
    expect(row.modelChars).toBe(rendered.text.length);
    expect(row.modelSha256).toBe(sha256(rendered.text));
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
  });

  it('scope=all：未截断的调用也留存', async () => {
    const store = { saveIfAbsent: jest.fn() };
    const svc = makeService(store, { TOOL_RESULT_BODY_SCOPE: 'all' });
    await svc.capture({
      auditRowId: 9,
      userId: '42',
      toolName: 'query_customers',
      result: smallResult,
    });
    expect(store.saveIfAbsent).toHaveBeenCalledTimes(1);
    const row = store.saveIfAbsent.mock.calls[0][0];
    expect(row.bodyState).toBe('stored');
    expect(row.wasTruncated).toBe(false);
    expect(row.bodyText).toContain('[REDACTED]');
    expect(row.bodyText).not.toContain('alice@example.com');
    expect(row.modelText).toBeNull();
    expect(row.modelSha256).toBeNull();
  });

  it('超过单条上限：落 capped，正文不存、哈希与大小仍在', async () => {
    const store = { saveIfAbsent: jest.fn() };
    const svc = makeService(store, { TOOL_RESULT_BODY_MAX_BYTES: 1024 });
    await svc.capture({
      auditRowId: 11,
      userId: '42',
      toolName: 'query_customers',
      result: bigResult,
      rendered: new ToolPresentationService({} as never, {} as never).renderToolResult(bigResult),
    });
    const row = store.saveIfAbsent.mock.calls[0][0];
    expect(row.bodyState).toBe('capped');
    expect(row.bodyText).toBeNull();
    expect(row.storedBytes).toBeNull();
    expect(row.bodySha256).toBeNull();
    expect(row.originalSha256).toHaveLength(64);
    expect(row.bodyBytes).toBeGreaterThan(1024);
    // 模型投影仍保留（有模型看到它的路径）。
    expect(row.modelText).toBeTruthy();
  });

  it('失败的调用记 failed', async () => {
    const store = { saveIfAbsent: jest.fn() };
    const svc = makeService(store, { TOOL_RESULT_BODY_SCOPE: 'all' });
    await svc.capture({
      auditRowId: 12,
      userId: '42',
      toolName: 'query_customers',
      result: { success: false, error: 'boom', data: { big: 'x'.repeat(5000) } },
    });
    expect(store.saveIfAbsent.mock.calls[0][0].outcome).toBe('failed');
  });

  it('写入抛错不影响调用方（留存是证据，不是闸）', async () => {
    const store = { saveIfAbsent: jest.fn().mockRejectedValue(new Error('db down')) };
    const svc = makeService(store);
    await expect(
      svc.capture({
        auditRowId: 13,
        userId: '42',
        toolName: 'query_customers',
        result: bigResult,
      }),
    ).resolves.toBeUndefined();
  });

  it('没有 store 时不写、也不抛', async () => {
    const svc = new ToolResultRetentionService(
      { get: (_k: string, d: unknown) => d } as never,
      undefined,
      new ToolPresentationService({} as never, {} as never),
    );
    await expect(
      svc.capture({ auditRowId: 14, userId: '42', toolName: 't', result: bigResult }),
    ).resolves.toBeUndefined();
  });
});
