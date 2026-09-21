// SPDX-License-Identifier: Apache-2.0

import { StreamAccumulator } from './stream-accumulator';

/**
 * 流式归并单测（阶段 3 第十一刀新增——此前这段归并内联在 600 行的 `chatStreamImpl` 里，
 * **没有直接覆盖**，只有穿大方法的集成级断言。搬迁纪律要求「行为不变有测试守」，故在此补上）。
 */
describe('StreamAccumulator（流式 chunk 归并）', () => {
  let acc: StreamAccumulator;

  beforeEach(() => {
    acc = new StreamAccumulator();
  });

  it('text：累积 + 逐块转发（流式的意义就在逐块下发）', () => {
    const f1 = acc.apply({ type: 'text', content: '你' });
    const f2 = acc.apply({ type: 'text', content: '好' });

    expect(f1).toEqual({ type: 'text', content: '你' });
    expect(f2).toEqual({ type: 'text', content: '好' });
    expect(acc.fullText).toBe('你好');
  });

  it('reasoning：只累积，**不**转发（推理内容不进客户端流）', () => {
    const f = acc.apply({ type: 'reasoning', content: '思考中' });

    expect(f).toBeNull();
    expect(acc.reasoningText).toBe('思考中');
    expect(acc.fullText).toBe('');
  });

  it('tool_call：同 index 跨 chunk 拼装——id/name 覆盖、arguments 追加', () => {
    acc.apply({ type: 'tool_call', toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{"a"' } });
    acc.apply({ type: 'tool_call', toolCall: { index: 0, arguments: ':1}' } });

    expect(acc.hasToolCalls).toBe(true);
    expect(acc.toolCalls()).toEqual([
      { id: 'call_1', name: 'query_events', args: '{"a":1}', index: 0 },
    ]);
  });

  it('tool_call：缺 index 视作 0；后到的 id/name **覆盖**（与提出前同口径）', () => {
    acc.apply({ type: 'tool_call', toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{}' } });
    acc.apply({ type: 'tool_call', toolCall: { id: 'call_2', name: 'create_todo' } });

    expect(acc.toolCalls()).toEqual([
      { id: 'call_2', name: 'create_todo', args: '{}', index: 0 },
    ]);
  });

  it('多个工具调用：按 index 首次出现顺序，互不串味', () => {
    acc.apply({ type: 'tool_call', toolCall: { index: 1, id: 'c2', name: 'create_todo', arguments: '{}' } });
    acc.apply({ type: 'tool_call', toolCall: { index: 0, id: 'c1', name: 'query_events', arguments: '{}' } });

    expect(acc.toolCalls().map((t) => t.id)).toEqual(['c2', 'c1']); // 插入序，非 index 排序
    expect(acc.toolCalls().map((t) => t.index)).toEqual([1, 0]);
  });

  it('error：记下 + 转发（客户端要知道失败）', () => {
    const f = acc.apply({ type: 'error', error: 'boom' });

    expect(f).toEqual({ type: 'error', error: 'boom' });
    expect(acc.streamError).toBe('boom');
  });

  it('done：多个 done 的 usage 累加；无 usage 则留 undefined', () => {
    expect(acc.usage).toBeUndefined();
    acc.apply({ type: 'done', usage: { promptTokens: 10, completionTokens: 2 } });
    acc.apply({ type: 'done' });
    acc.apply({ type: 'done', usage: { promptTokens: 5, completionTokens: 1 } });

    expect(acc.usage).toEqual({ promptTokens: 15, completionTokens: 3 });
  });

  it('普通读工具链一轮：文本 + 工具调用混合时各自归位', () => {
    acc.apply({ type: 'text', content: '稍等' });
    acc.apply({ type: 'tool_call', toolCall: { index: 0, id: 'c1', name: 'query_events', arguments: '{}' } });
    acc.apply({ type: 'done', usage: { promptTokens: 3, completionTokens: 1 } });

    expect(acc.fullText).toBe('稍等');
    expect(acc.hasToolCalls).toBe(true);
    expect(acc.toolCalls()).toHaveLength(1);
    expect(acc.streamError).toBeUndefined();
  });
});
