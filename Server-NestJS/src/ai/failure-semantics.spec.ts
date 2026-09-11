// SPDX-License-Identifier: Apache-2.0

/**
 * CE-3 薄片 failure semantics（wire 级）：失败语义向量 ↔ 承载 schema / 语料 漂移门。
 * - 每个 outcome 的 wireSchema 必须是 registry 已冻结的 wire 对象（不引平行面）；
 * - 每个 outcome 绑定的 failurePath 必须存在于 specs/scenarios/failure-path-v1.json；
 * - 覆盖门：所有「有层（layer ≠ —）」的 FP 都必须有 wire 级失败语义绑定
 *   （FP-9 迁移中断由 CI migration-consistency job 覆盖，layer=—，不在本契约内）；
 * - id 唯一。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROTOCOL_DIR = resolve(__dirname, '../../specs/protocol');
const SCENARIOS_DIR = resolve(__dirname, '../../specs/scenarios');

const vector = JSON.parse(
  readFileSync(resolve(PROTOCOL_DIR, 'failure-semantics-v1-vector.json'), 'utf8'),
) as { outcomes: Array<{ id: string; wireSchema: string | null; failurePath: string; invariant: string }> };

const registry = JSON.parse(readFileSync(resolve(PROTOCOL_DIR, 'wire-schema-registry.json'), 'utf8')) as {
  objects: Array<{ id: string }>;
};
const failurePack = JSON.parse(readFileSync(resolve(SCENARIOS_DIR, 'failure-path-v1.json'), 'utf8')) as {
  cases: Array<{ id: string; layer: string }>;
};

describe('CE-3 failure semantics（wire 级）· 绑定漂移门', () => {
  const registryIds = new Set(registry.objects.map((o) => o.id));
  const fpAll = new Set(failurePack.cases.map((c) => c.id));
  const fpLayered = failurePack.cases.filter((c) => c.layer !== '—').map((c) => c.id);

  it('outcome id 唯一且非空', () => {
    const ids = vector.outcomes.map((o) => o.id);
    expect(ids.every((i) => typeof i === 'string' && i.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个 wireSchema 是 registry 已冻结的 wire 对象（不引平行面）', () => {
    for (const o of vector.outcomes) {
      if (o.wireSchema === null) continue;
      expect(registryIds.has(o.wireSchema)).toBe(true);
    }
  });

  it('每个 failurePath 存在于 failure-path-v1.json', () => {
    for (const o of vector.outcomes) {
      expect(fpAll.has(o.failurePath)).toBe(true);
    }
  });

  it('覆盖门：所有 layer ≠ — 的 FP 都有 wire 级失败语义绑定', () => {
    const bound = new Set(vector.outcomes.map((o) => o.failurePath));
    for (const id of fpLayered) {
      expect(bound.has(id)).toBe(true);
    }
  });

  it('每项含 invariant（must-share 保证）', () => {
    for (const o of vector.outcomes) {
      expect(typeof o.invariant === 'string' && o.invariant.length > 0).toBe(true);
    }
  });
});
