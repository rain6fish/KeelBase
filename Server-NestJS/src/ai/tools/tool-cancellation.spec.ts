// SPDX-License-Identifier: Apache-2.0

/**
 * AW-14 — the cancellation contract: the signal reaches the tools, and a cancellation is read as a
 * process (requested → confirmed / unknown), never as a fact we did not observe.
 *
 * The distinctions these tests pin down:
 *
 *   yes + confirmed          → aborted          (work stopped; nothing is claimed about a partial run)
 *   yes + unknown            → abandoned        (we asked, it did not settle — a declaration is not a fact)
 *   no / unknown + confirmed → abandoned        (the classification forbids `aborted` even when it returned)
 *   no / unknown + requested → abandoned        (asking an unstoppable tool stops nothing)
 *   pre-aborted              → work never starts; the classification still decides the reading
 *
 * AW-14 —— 取消契约：信号到达工具，且取消被读成一个**过程**（requested → confirmed / unknown），
 * 绝不是我们没观察到的事实。
 *
 * 这些用例钉住的区分：
 *
 *   yes + confirmed          → aborted          （工作已停；不对局部执行下断言）
 *   yes + unknown            → abandoned        （要求了、它没返回 —— 声明不是事实）
 *   no / unknown + confirmed → abandoned        （即使返回了，分类也不允许 aborted）
 *   no / unknown + requested → abandoned        （要求一个停不掉的工具，什么也没停）
 *   预先已中止               → 工作从未开始；读数仍由分类决定
 */

import { ToolResult } from '../interfaces/tool.interface';
import { ExternalToolRegistry } from './external-tool-registry';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistry } from './tool-registry';
import {
  CANCELLATION_CONFIRM_WINDOW_MS,
  NON_ABORTABLE_TOOL_WINDOW_MS,
} from './tool-abortability';
import { toolExecutionScope } from './tool-cancellation';
import { QueryEventsTool } from './query-events.tool';
import { CreateEventTool } from './create-event.tool';

const hung = <T>() => new Promise<T>(() => {});
const tick = () => new Promise((r) => setImmediate(r));

/** Work that settles only when the executor's signal fires — a tool that honours the contract. */
const stopsOnSignal =
  (result: ToolResult = { success: false, error: 'stopped by signal' }) =>
  (_n: string, _a: unknown, _u: string, signal?: AbortSignal) =>
    new Promise<ToolResult>((resolve) => {
      signal?.addEventListener('abort', () => resolve(result), { once: true });
    });

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

function withEffects(svc: ToolExecutionService, claimWon: (call: number) => boolean) {
  const state = { releaseClaim: jest.fn().mockResolvedValue(undefined), claimCalls: 0 };
  (svc as never as { toolEffectsService: unknown }).toolEffectsService = {
    findExisting: jest.fn().mockResolvedValue({ existing: false }),
    claimWrite: jest.fn().mockImplementation(async () => {
      state.claimCalls += 1;
      return { won: claimWon(state.claimCalls) };
    }),
    settleClaim: jest.fn().mockResolvedValue(undefined),
    releaseClaim: state.releaseClaim,
  };
  return state;
}

describe('AW-14 三态：requested → confirmed / unknown', () => {
  it('no 工具被中止 ⇒ requested（要求停不下它），结论 abandoned、结局 unknown', async () => {
    const { svc, registry } = makeService({ riskLevel: 'R1', abortable: 'no' });
    registry.execute.mockReturnValue(hung<ToolResult>());
    const ctrl = new AbortController();
    const p = svc.executeRead('read_via_proxy', {}, '1', { signal: ctrl.signal });
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toContain('abandoned');
    expect(result.error).toContain('cancellation requested');
    expect(result.error).toContain('unknown');
    expect(result.error).not.toContain('aborted');
  });

  it('unknown 工具被中止、即使工作返回也只到 unknown（返回不等于「目标侧停下」）', async () => {
    const { svc, registry } = makeService({ requiresConfirmation: true });
    registry.execute.mockImplementation(stopsOnSignal());
    const ctrl = new AbortController();
    const p = svc.executeRead('some_write', {}, '1', { signal: ctrl.signal });
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toContain('abandoned');
    expect(result.error).toContain('cancellation unknown');
    expect(result.error).not.toContain('aborted');
  });

  it('超时后仍不能判定 ⇒ unknown（yes 工具不返回，不进 aborted）', async () => {
    jest.useFakeTimers();
    try {
      const { svc, registry } = makeService({ riskLevel: 'R1' });
      registry.execute.mockReturnValue(hung<ToolResult>());
      const ctrl = new AbortController();
      const p = svc.executeRead('query_events', {}, '1', { signal: ctrl.signal });
      await Promise.resolve();
      ctrl.abort();
      // Let the executor schedule its confirmation window at the current fake time, then let it elapse.
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(CANCELLATION_CONFIRM_WINDOW_MS);
      const result = await p;
      expect(result.error).toContain('cancellation unknown');
      expect(result.error).not.toContain('aborted');
    } finally {
      jest.useRealTimers();
    }
  });

  it('取消在开始之前到达 ⇒ 工作从未启动；yes 记 aborted、no 记 abandoned', async () => {
    const yes = makeService({ riskLevel: 'R1' });
    const ctrl = new AbortController();
    ctrl.abort();
    const yesResult = await yes.svc.executeRead('query_events', {}, '1', { signal: ctrl.signal });
    expect(yes.registry.execute).not.toHaveBeenCalled();
    expect(yesResult.error).toContain('aborted');

    const no = makeService({ riskLevel: 'R1', abortable: 'no' });
    const noResult = await no.svc.executeRead('read_via_proxy', {}, '1', { signal: ctrl.signal });
    expect(no.registry.execute).not.toHaveBeenCalled();
    expect(noResult.error).toContain('abandoned');
  });

  it('有界窗口到点 ⇒ 不报成功，且结论仍是 abandoned（窗口是一次取消请求，不是一次停止）', async () => {
    jest.useFakeTimers();
    try {
      const { svc, registry } = makeService({ requiresConfirmation: true });
      registry.execute.mockReturnValue(hung<ToolResult>());
      const p = svc.executeRead('some_write', {}, '1');
      await jest.advanceTimersByTimeAsync(NON_ABORTABLE_TOOL_WINDOW_MS);
      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toContain('abandoned');
      expect(result.error).not.toContain('aborted');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('AW-14 执行上下文：信号从入口到达工具', () => {
  it('调用方没显式传 signal 时，执行器读取入口开的作用域', async () => {
    const { svc, registry } = makeService({ riskLevel: 'R1' });
    registry.execute.mockImplementation(stopsOnSignal());
    const ctrl = new AbortController();
    const p = toolExecutionScope.run({ signal: ctrl.signal }, () =>
      svc.executeRead('query_events', {}, '1'),
    );
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.error).toContain('aborted');
  });

  it('注册表把 signal 原样转交给工具', async () => {
    const registry = new ToolRegistry();
    const execute = jest.fn().mockResolvedValue({ success: true });
    registry.register({
      name: 'demo',
      description: '',
      parameters: [],
      toToolDefinition: () => ({ type: 'function', function: { name: 'demo', description: '', parameters: {} } }),
      execute,
    } as never);
    const signal = new AbortController().signal;
    await registry.execute('demo', {}, '1', signal);
    expect(execute).toHaveBeenCalledWith({}, '1', signal);
  });

  it('本地读（yes）观察信号：已中止时不执行查询，直接返回失败', async () => {
    const getEventsForRange = jest.fn();
    const tool = new QueryEventsTool({ getEventsForRange } as never);
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await tool.execute({}, '1', ctrl.signal);
    expect(getEventsForRange).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
  });

  it('本地写（unknown）观察信号：已中止时不动手写入', async () => {
    const create = jest.fn();
    const tool = new CreateEventTool({ create } as never);
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await tool.execute(
      { title: 'X', startTime: '2026-01-01T00:00:00Z', endTime: '2026-01-01T01:00:00Z' },
      '1',
      ctrl.signal,
    );
    expect(create).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
  });
});

describe('AW-14 写路径：重试不得造成第二次副作用', () => {
  it('abandoned 留下占位 ⇒ 同一调用的重试被占位挡住，工具只执行一次', async () => {
    const { svc, registry } = makeService({ requiresConfirmation: true });
    registry.execute.mockReturnValue(hung<ToolResult>());
    const effects = withEffects(svc, (call) => call === 1);

    const ctrl = new AbortController();
    const first = svc.executeWrite('create_event', { title: 'X' }, '1', 'c1', undefined, {
      signal: ctrl.signal,
    });
    await tick();
    ctrl.abort();
    const firstResult = await first;
    expect(firstResult.error).toContain('abandoned');
    expect(effects.releaseClaim).not.toHaveBeenCalled();

    const second = await svc.executeWrite('create_event', { title: 'X' }, '1', 'c1');
    expect(registry.execute).toHaveBeenCalledTimes(1);
    expect(second.success).toBe(false);
    expect(second.error).toContain('已由另一请求接管');
  });

  it('aborted 释放占位 ⇒ 重试仍然可用（工作已停、事务未提交）', async () => {
    const { svc, registry } = makeService({ riskLevel: 'R1', requiresConfirmation: true, abortable: 'yes' });
    registry.execute.mockImplementation(stopsOnSignal());
    const effects = withEffects(svc, () => true);

    const ctrl = new AbortController();
    const p = svc.executeWrite('some_write', { a: 1 }, '1', 'c1', undefined, {
      signal: ctrl.signal,
    });
    await tick();
    ctrl.abort();
    const result = await p;
    expect(result.error).toContain('aborted');
    expect(effects.releaseClaim).toHaveBeenCalledWith(expect.any(String), 'aborted');
  });
});
