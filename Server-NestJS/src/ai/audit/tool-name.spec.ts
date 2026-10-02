// SPDX-License-Identifier: Apache-2.0

import { extractToolName, parseToolCall } from './tool-name';

/**
 * Five read paths used to parse the audit `detail` with five different regexes. The divergence was
 * not academic: `audit-interpreter`'s class `[a-z_]+` stopped at the first digit, so a row for
 * `summarize_customer_360` parsed to the empty string and that tool vanished from the interpretation.
 * `ai-feature-map` had a `Tool:` branch the others lacked; `decision-trace` used `\w` and needed the
 * arguments. These cases pin the union, and pin the one case the narrowest copy got wrong.
 *
 * 五个读取侧曾各用一条不同的正则解析审计 `detail`。分歧不是学术问题：`audit-interpreter` 的字符集
 * `[a-z_]+` 停在第一个数字，于是 `summarize_customer_360` 那种行解析成空串、那个工具在解释里消失。
 * `ai-feature-map` 多一条 `Tool:` 分支，`decision-trace` 用 `\w` 且需要参数。下列用例钉住并集，
 * 并钉住最窄那份判错的那一个。
 */
describe('parseToolCall / extractToolName（工具名解析单一真源）', () => {
  it('`name(args)` → 工具名 + 参数', () => {
    expect(parseToolCall('create_event({"title":"meeting"})')).toEqual({
      toolName: 'create_event',
      args: '{"title":"meeting"}',
    });
  });

  it('工具名含数字 —— 旧 `[a-z_]+` 那份在此返回空', () => {
    expect(parseToolCall('summarize_customer_360({"id":7})')).toEqual({
      toolName: 'summarize_customer_360',
      args: '{"id":7}',
    });
    expect(extractToolName('summarize_customer_360({"id":7})')).toBe('summarize_customer_360');
  });

  it('参数里含 `)` 与换行也吃得下（贪婪到最后一个右括号、`s` 标志）', () => {
    expect(parseToolCall('create_event({"note":"a)b","x":\n1})')).toEqual({
      toolName: 'create_event',
      args: '{"note":"a)b","x":\n1}',
    });
  });

  it('只有 `name(` 前缀（无收尾括号）→ 仍给出名字，参数为 null', () => {
    expect(parseToolCall('create_event({"a":1')).toEqual({ toolName: 'create_event', args: null });
  });

  it('`Tool: name` 形态（ai-feature-map 原有分支，并集保留）', () => {
    expect(parseToolCall('Tool: create_event')).toEqual({ toolName: 'create_event', args: null });
    expect(parseToolCall('tool:query_events')).toEqual({ toolName: 'query_events', args: null });
  });

  it('大小写：`\\w` 那份允许大写，并集保留', () => {
    expect(extractToolName('CreateEvent({"a":1})')).toBe('CreateEvent');
  });

  it('不像工具调用的 detail → null（调用方据此跳过，不猜）', () => {
    expect(parseToolCall('用户问了天气')).toBeNull();
    expect(parseToolCall('create_event')).toBeNull();
    expect(parseToolCall('')).toBeNull();
    expect(parseToolCall(null)).toBeNull();
    expect(parseToolCall(undefined)).toBeNull();
  });

  it('extractToolName 与 parseToolCall 同源（前者只是后者取名字）', () => {
    for (const detail of ['create_event({})', 'summarize_customer_360({})', 'Tool: x', '不像']) {
      expect(extractToolName(detail)).toBe(parseToolCall(detail)?.toolName ?? null);
    }
  });
});
