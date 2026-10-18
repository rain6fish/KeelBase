// SPDX-License-Identifier: Apache-2.0

/**
 * Q-2 drift gate: every remaining implementation of the **protocol** canonical form must produce a
 * byte-identical string for the same input.
 *
 * The remaining implementations of that one contract are:
 *   1. `canonicalJSON` in `src/common/canonical-json.ts` (the application runtime);
 *   2. `canonicalJSON` in `scripts/lib/canonical-json.mjs` (used by the standalone offline verifier —
 *      it may not import application code, so the spec is implemented independently);
 *   3. `canonicalJSON` in the contract repo's reference implementation
 *      (`specs/protocol/runner/lib/protocol-algorithms.mjs`).
 *
 * They live in three dependency domains (Nest runtime / standalone Node script / contract repo), so
 * they cannot share a module. This gate runs all three over one representative corpus — flat,
 * nested-whitelist, arrays of objects, `undefined` object values and array elements, `null`,
 * unicode keys, number boundaries, empty containers — and compares the strings. Any drift is red.
 *
 * The recursive form (`sortKeys`) is a **different contract** and has exactly one implementation
 * after Q-2. The last two cases below pin that difference so a future "unification" cannot silently
 * change stored hashes: the protocol form drops nested keys that are not in K; the recursive form
 * keeps every key. Changing either is a semantic change, not a refactor.
 *
 * Q-2 漂移门禁：**协议**规范形式的每一个现存实现，对同一输入都必须产出逐字节相同的字符串。
 *
 * 该契约的现存实现有三处：应用运行时（`src/common/canonical-json.ts`）、独立离线验证脚本
 * （`scripts/lib/canonical-json.mjs`，按设计不得 import 应用代码，故依规格独立实现）、契约仓参考实现
 * （`specs/protocol/runner/lib/protocol-algorithms.mjs`）。三者分属三个依赖域，无法共享模块，故本闸
 * 用一份代表性语料同时跑三者并比对字符串——扁平 / 嵌套白名单 / 对象数组 / 对象值与数组元素的
 * `undefined` / `null` / unicode 键 / 数字边界 / 空容器。任何漂移即红。
 *
 * 递归形态（`sortKeys`）是**另一份契约**，Q-2 之后只剩一个实现。末尾两例把这一差异钉住，使未来的
 * 「统一」不可能悄悄改变已存哈希：协议形态会丢弃不在 K 中的嵌套键，递归形态保留全部键。改任何一方
 * 都是语义变更，不是重构。
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJSON, sortKeys } from './canonical-json';

/**
 * Representative corpus. `undefined` and `-0` cannot survive `JSON.stringify`, so the child process
 * receives them as sentinels and revives them (see `runInChild`).
 *
 * 代表性语料。`undefined` 与 `-0` 无法原样穿过 `JSON.stringify`，故子进程以哨兵形式接收后再还原
 * （见 `runInChild`）。
 */
const CASES: Array<Record<string, unknown>> = [
  {},
  { b: 1, a: 2 },
  { a: null, b: undefined, c: 1 },
  { z: false, a: true, m: null },
  { a: { b: 1 } },
  { outer: { y: 2, x: 1 } },
  { outer: 1, x: 2 },
  { arr: [{ z: 1, a: 2 }, 3, null] },
  { arr: [undefined, 'x'] },
  { 'é': 1, 'e': 2, 'Z': 3, 'a': 4 },
  { n: [-0, 1e21, 1e-7, 0.1, -3.5] },
  { empty: {}, list: [], s: '' },
];

/** Sentinel encoding so `undefined` / `-0` reach the child intact. */
function encode(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v === undefined) return { __q2Undefined: true };
    if (typeof v === 'number' && Object.is(v, -0)) return { __q2NegativeZero: true };
    return v;
  });
}

/** Both script-side implementations, evaluated in a real Node ESM process (jest's runtime is CJS). */
function runInChild(caseJson: string): { verifier: string[]; reference: string[] } {
  const verifier = pathToFileURL(resolve(__dirname, '../../scripts/lib/canonical-json.mjs')).href;
  const reference = pathToFileURL(
    resolve(__dirname, '../../specs/protocol/runner/lib/protocol-algorithms.mjs'),
  ).href;
  const script = `
const revive = (_k, v) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && v.__q2Undefined === true) return undefined;
  if (v && typeof v === 'object' && !Array.isArray(v) && v.__q2NegativeZero === true) return -0;
  return v;
};
const cases = JSON.parse(process.env.KB_Q2_CANONICAL_CASES, revive);
const [{ canonicalJSON: verifier }, { canonicalJSON: reference }] = await Promise.all([
  import(${JSON.stringify(verifier)}),
  import(${JSON.stringify(reference)}),
]);
process.stdout.write(JSON.stringify({
  verifier: cases.map((c) => verifier(c)),
  reference: cases.map((c) => reference(c)),
}));
`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, KB_Q2_CANONICAL_CASES: caseJson },
  });
  return JSON.parse(out) as { verifier: string[]; reference: string[] };
}

describe('Q-2 canonical JSON drift gate', () => {
  const app = CASES.map((c) => canonicalJSON(c));
  const outside = runInChild(encode(CASES));

  it('offline verifier (scripts/lib/canonical-json.mjs) agrees byte for byte', () => {
    expect(outside.verifier).toEqual(app);
  });

  it('contract reference (specs/protocol/runner/lib/protocol-algorithms.mjs) agrees byte for byte', () => {
    expect(outside.reference).toEqual(app);
  });

  it('sortKeys is the single recursive implementation (every key kept, all levels sorted)', () => {
    const shuffled = { z: 1, a: { y: 2, b: [{ d: 4, c: 3 }] }, m: undefined, n: null };
    expect(JSON.stringify(sortKeys(shuffled))).toBe('{"a":{"b":[{"c":3,"d":4}],"y":2},"n":null,"z":1}');
  });

  it('the two contracts stay deliberately different (do not merge them)', () => {
    // Protocol §2.3: K is ["a"], so the nested "b" is dropped. Frozen by stored audit-chain hashes.
    // 协议 §2.3：K 只有 ["a"]，故嵌套的 "b" 被丢弃。已由已存审计链哈希冻结。
    expect(canonicalJSON({ a: { b: 1 } })).toBe('{"a":{}}');
    // Recursive form keeps it. Frozen by idempotency keys already stored in the database.
    // 递归形态保留它。已由数据库中已存的幂等键冻结。
    expect(JSON.stringify(sortKeys({ a: { b: 1 } }))).toBe('{"a":{"b":1}}');
  });
});
