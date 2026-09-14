// SPDX-License-Identifier: Apache-2.0

/**
 * 实时事件名 == 冻结 wire 契约（CE-2 缺口 ②：实现侧绑定）。
 *
 * 事件名枚举是**跨端冻结敏感点**（schema description 记：曾现 gateway 注释 {type,data} 与实现 {event,data} 漂移）。
 * 本测试把「运行时事件名集」与「wire 契约枚举」绑死——增删任一事件名必须同步改 schema，否则红。
 *   - ws-frame：WS_EVENTS（信封事件）+ AI_CHUNK_TO_WS（chunk.type → ai:* 事件）的值集
 *   - sse-event：AI_CHUNK_TO_WS 的键集（= chatStream chunk.type 全集）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WS_EVENTS, AI_CHUNK_TO_WS } from './realtime.types';

const schemaOf = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../../specs/protocol/schemas/v1/${name}`), 'utf8'),
  ) as Record<string, unknown>;

describe('实时事件名 == 冻结 wire 契约', () => {
  it('ws-frame：WS_EVENTS ∪ AI_CHUNK_TO_WS 的值集 == schema.event 枚举', () => {
    const schema = schemaOf('ws-frame.schema.json') as { properties: { event: { enum: string[] } } };
    const runtime = [...new Set([...Object.values(WS_EVENTS), ...Object.values(AI_CHUNK_TO_WS)])].sort();
    expect(runtime).toEqual([...schema.properties.event.enum].sort());
  });

  it('sse-event：AI_CHUNK_TO_WS 键集（chatStream chunk.type 全集）== schema oneOf const 集', () => {
    const schema = schemaOf('sse-event.schema.json') as {
      oneOf: Array<{ properties: { type: { const: string } } }>;
    };
    const runtime = Object.keys(AI_CHUNK_TO_WS).sort();
    const contract = schema.oneOf.map((b) => b.properties.type.const).sort();
    expect(runtime).toEqual(contract);
  });
});
