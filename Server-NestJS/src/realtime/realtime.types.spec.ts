// SPDX-License-Identifier: Apache-2.0

/**
 * 实时事件名 == 冻结 wire 契约（CE-2 缺口 ②：实现侧绑定）。
 *
 * 事件名枚举是**跨端冻结敏感点**（schema description 记：曾现 gateway 注释 {type,data} 与实现 {event,data} 漂移）。
 * 本测试把「运行时事件名集」与「wire 契约枚举」绑死——增删任一事件名必须同步改 schema，否则红。
 *   - ws-frame：WS_EVENTS（信封事件）+ AI_CHUNK_TO_WS（chunk.type → ai:* 事件）的值集
 *   - sse-event：AI_CHUNK_TO_WS 的键集（= chatStream chunk.type 全集）
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { WS_EVENTS, AI_CHUNK_TO_WS } from './realtime.types';

const SPECS_ROOT = resolve(__dirname, '../../specs/protocol');

/**
 * 取 wire 对象的**当前版本** schema（版本以 registry 为准）。
 *
 * **别再写死 `schemas/v1/`**：契约升版后写死会指向**旧版**——事件名一旦增删，改的是 v2/v3 而这里
 * 仍读 v1，断言就会红在一个与本次改动无关的地方（假红）。本文件曾如此，2026-09-17 改随 registry
 * （同 `ai.service.spec` 的 `wiredSchema` 口径）。
 */
function schemaOf(objectId: string): Record<string, unknown> {
  const registry = JSON.parse(readFileSync(resolve(SPECS_ROOT, 'wire-schema-registry.json'), 'utf8')) as {
    schemasDir: string;
    objects: Array<{ id: string; version: string; schema: string }>;
  };
  const entry = registry.objects.find((o) => o.id === objectId);
  if (!entry) throw new Error(`registry 缺对象：${objectId}`);
  const dir = resolve(SPECS_ROOT, registry.schemasDir, entry.version);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Record<string, unknown>;
    if (parsed.$id === entry.schema) return parsed;
  }
  throw new Error(`未找到 ${objectId} 的 schema（registry $id=${entry.schema}，目录 ${entry.version}）`);
}

describe('实时事件名 == 冻结 wire 契约', () => {
  it('ws-frame：WS_EVENTS ∪ AI_CHUNK_TO_WS 的值集 == schema.event 枚举', () => {
    const schema = schemaOf('ws-frame') as { properties: { event: { enum: string[] } } };
    const runtime = [...new Set([...Object.values(WS_EVENTS), ...Object.values(AI_CHUNK_TO_WS)])].sort();
    expect(runtime).toEqual([...schema.properties.event.enum].sort());
  });

  it('sse-event：AI_CHUNK_TO_WS 键集（chatStream chunk.type 全集）== schema oneOf const 集', () => {
    const schema = schemaOf('sse-event') as {
      oneOf: Array<{ properties: { type: { const: string } } }>;
    };
    const runtime = Object.keys(AI_CHUNK_TO_WS).sort();
    const contract = schema.oneOf.map((b) => b.properties.type.const).sort();
    expect(runtime).toEqual(contract);
  });
});
