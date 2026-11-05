// SPDX-License-Identifier: Apache-2.0

/**
 * AW-18 — tool abortability: classification, the two cancellation readings, and the bounded window.
 * The point of these tests is the **distinction**: a non-abortable tool that is cancelled must read
 * `abandoned` with an `unknown` outcome, never `aborted`; only a `yes` tool may read `aborted`.
 *
 * AW-18 —— 工具可中止性：分类、两种取消读数、有界窗口。这些用例要证的是那个**区分**：停不掉的
 * 工具被取消必须是 `abandoned` + 结局 `unknown`，绝不是 `aborted`；只有 `yes` 的工具才记 `aborted`。
 */

import { ToolResult } from '../interfaces/tool.interface';
import { ExternalToolRegistry } from './external-tool-registry';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistry } from './tool-registry';
import {
  NON_ABORTABLE_TOOL_WINDOW_MS,
  cancellationReading,
  resolveAbortability,
} from './tool-abortability';
import { ProxyTool } from '../proxy/proxy-tool';
import { QueryEventsTool } from './query-events.tool';
import { CreateEventTool } from './create-event.tool';
import { WebSearchTool } from './web-search.tool';
import { GenerateImageTool } from './generate-image.tool';
import { SummarizeCustomerTool } from './summarize-customer.tool';
import { AnalyzeSalesPipelineTool } from './analyze-sales-pipeline.tool';
import { CreateModuleTool } from './create-module.tool';
import { CreateModuleApplyTool } from './create-module-apply.tool';

const hung = <T>() => new Promise<T>(() => {});
const tick = () => new Promise((r) => setImmediate(r));

function makeService(tool: unknown) {
  const registry = {
    execute: jest.fn(),
    getTool: jest.fn().mockReturnValue(tool),
    requiresConfirmation: jest.fn(),
    riskLevel: jest.fn(),
  };
  const gate = {
    assertToolAllowed: jest.fn().mockResolvedValue(undefined),
    assertWithinDeclaredScope: jest.fn().mockResolvedValue(undefined),
    assertApprovalRequirementHolds: jest.fn().mockResolvedValue(undefined),
    decisionBasis: jest.fn().mockResolvedValue({ role: 'user', policyRevision: 'p1' }),
    destinationOf: jest.fn().mockReturnValue('local'),
  };
  const external = new ExternalToolRegistry();
  const svc = new ToolExecutionService(
    registry as unknown as ToolRegistry,
    gate as never,
    external,
  );
  return { svc, registry, gate, external };
}

describe('AW-18 分类：工具怎么接受取消', () => {
  it('本地只读且未声明 ⇒ yes（要么做完、要么从未开始，不留还能改状态的东西）', () => {
    expect(resolveAbortability({ riskLevel: 'R1' })).toBe('yes');
    expect(resolveAbortability({ riskLevel: 'R0', requiresConfirmation: false })).toBe('yes');
  });

  it('本地写且未声明 ⇒ unknown（不把「停不掉」说成 yes）', () => {
    expect(resolveAbortability({ requiresConfirmation: true })).toBe('unknown');
    expect(resolveAbortability({ riskLevel: 'R3' })).toBe('unknown');
  });

  it('显式声明覆盖类别规则', () => {
    expect(resolveAbortability({ riskLevel: 'R1', abortable: 'no' })).toBe('no');
    expect(resolveAbortability({ requiresConfirmation: true, abortable: 'yes' })).toBe('yes');
  });

  it('查不到的工具名 ⇒ unknown（unknown 不是 yes）', () => {
    const registry = new ToolRegistry();
    expect(registry.abortability('does_not_exist')).toBe('unknown');
  });

  it('真实工具类按文件可复核：只读 yes / 写 unknown / 外部 no / 例外表', () => {
    const delegation = {} as never;
    // 本地只读（类别规则）
    expect(new QueryEventsTool({} as never).abortable).toBeUndefined();
    expect(resolveAbortability(new QueryEventsTool({} as never))).toBe('yes');
    // 本地写（类别规则）
    expect(resolveAbortability(new CreateEventTool({} as never))).toBe('unknown');
    // 外部代理（显式 no）
    const proxy = new ProxyTool(
      { name: 'proxy_read', description: '', method: 'GET', path: '/x', parameters: [] },
      delegation,
      'http://target',
      'target',
    );
    expect(proxy.abortable).toBe('no');
    // 例外表：进程内但离开本进程的读
    expect(new WebSearchTool({ get: () => '' } as never).abortable).toBe('no');
    expect(new GenerateImageTool({} as never).abortable).toBe('no');
    expect(new SummarizeCustomerTool({} as never).abortable).toBe('no');
    expect(new AnalyzeSalesPipelineTool({} as never).abortable).toBe('no');
    expect(new CreateModuleTool().abortable).toBe('unknown');
    expect(new CreateModuleApplyTool().abortable).toBe('unknown');
  });

  it('取消读数：只有 yes 记 aborted，no / unknown 一律 abandoned', () => {
    expect(cancellationReading('yes')).toBe('aborted');
    expect(cancellationReading('no')).toBe('abandoned');
    expect(cancellationReading('unknown')).toBe('abandoned');
  });
});

describe('AW-18 执行器：中止后的账与结论', () => {
  it('no 工具被中止 ⇒ abandoned、结局 unknown、不报成功', async () => {
    const { svc, registry } = makeService({ riskLevel: 'R1', abortable: 'no' });
    registry.execute.mockReturnValue(hung<ToolResult>());
    const ctrl = new AbortController();
    const p = svc.executeRead('read_via_proxy', {}, '1', { signal: ctrl.signal });
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toContain('abandoned');
    expect(result.error).toContain('unknown');
    expect(result.error).not.toContain('aborted');
  });

  it('unknown 工具被中止 ⇒ abandoned（缺省未声明即 unknown）', async () => {
    const { svc, registry } = makeService({ requiresConfirmation: true });
    registry.execute.mockReturnValue(hung<ToolResult>());
    const ctrl = new AbortController();
    const p = svc.executeRead('some_write', {}, '1', { signal: ctrl.signal });
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toContain('abandoned');
    expect(result.error).not.toContain('aborted');
  });

  it('外部 MCP 工具 ⇒ unknown ⇒ abandoned', async () => {
    const { svc, external } = makeService(undefined);
    external.register({
      isExternal: (n: string) => n.startsWith('mcp_'),
      requiresConfirmation: async () => false,
      callTool: jest.fn().mockReturnValue(hung()),
    } as never);
    const ctrl = new AbortController();
    const p = svc.executeRead('mcp_send_email', {}, '1', { signal: ctrl.signal });
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toContain('abandoned');
    expect(result.error).not.toContain('aborted');
  });

  it('yes 工具被中止 ⇒ aborted（工作确实停了）', async () => {
    const { svc, registry } = makeService({ riskLevel: 'R1' });
    registry.execute.mockReturnValue(hung<ToolResult>());
    const ctrl = new AbortController();
    const p = svc.executeRead('query_events', {}, '1', { signal: ctrl.signal });
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
    expect(result.error).not.toContain('abandoned');
  });

  it('no / unknown 受有界窗口约束：窗口到点即 abandoned，不无限挂起', async () => {
    jest.useFakeTimers();
    try {
      const { svc, registry } = makeService({ requiresConfirmation: true });
      registry.execute.mockReturnValue(hung<ToolResult>());
      const p = svc.executeRead('some_write', {}, '1');
      jest.advanceTimersByTime(NON_ABORTABLE_TOOL_WINDOW_MS);
      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toContain('abandoned');
    } finally {
      jest.useRealTimers();
    }
  });

  it('写路径：abandoned 不释放占位（结局未知，不邀请重试）', async () => {
    const { svc, registry } = makeService({ requiresConfirmation: true });
    const releaseClaim = jest.fn().mockResolvedValue(undefined);
    const settleClaim = jest.fn().mockResolvedValue(undefined);
    (svc as never as { toolEffectsService: unknown }).toolEffectsService = {
      findExisting: jest.fn().mockResolvedValue({ existing: false }),
      claimWrite: jest.fn().mockResolvedValue({ won: true }),
      settleClaim,
      releaseClaim,
    };
    registry.execute.mockReturnValue(hung<ToolResult>());
    const ctrl = new AbortController();
    const p = svc.executeWrite('create_event', { title: 'X' }, '1', 'c1', undefined, {
      signal: ctrl.signal,
    });
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toContain('abandoned');
    expect(releaseClaim).not.toHaveBeenCalled();
    expect(settleClaim).not.toHaveBeenCalled();
  });

  it('写路径：yes 工具 aborted ⇒ 释放占位（工作已停，重试仍可用）', async () => {
    const { svc, registry } = makeService({ requiresConfirmation: true, abortable: 'yes' });
    const releaseClaim = jest.fn().mockResolvedValue(undefined);
    (svc as never as { toolEffectsService: unknown }).toolEffectsService = {
      findExisting: jest.fn().mockResolvedValue({ existing: false }),
      claimWrite: jest.fn().mockResolvedValue({ won: true }),
      settleClaim: jest.fn().mockResolvedValue(undefined),
      releaseClaim,
    };
    registry.execute.mockReturnValue(hung<ToolResult>());
    const ctrl = new AbortController();
    const p = svc.executeWrite('some_write', { a: 1 }, '1', 'c1', undefined, {
      signal: ctrl.signal,
    });
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
    expect(releaseClaim).toHaveBeenCalledWith(expect.any(String), 'aborted');
  });

  it('没有取消、也没有超窗 ⇒ 行为不变（照常返回工具结果）', async () => {
    const { svc, registry } = makeService({ riskLevel: 'R1' });
    registry.execute.mockResolvedValue({ success: true, data: { ok: 1 } });
    await expect(svc.executeRead('query_events', {}, '1')).resolves.toEqual({
      success: true,
      data: { ok: 1 },
    });
  });
});
