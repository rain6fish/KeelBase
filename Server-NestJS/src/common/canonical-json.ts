// SPDX-License-Identifier: Apache-2.0

/**
 * The two canonical serialisations this repository uses — one home, and **they are not
 * interchangeable**. Everything that hashes or signs a payload imports from here instead of
 * carrying its own copy.
 *
 * 1. `canonicalJSON` — protocol §2.3 (`docs/protocols/ai-governance-protocol.md`): the set **K** is
 *    every top-level key whose value is not `undefined`, sorted by UTF-16 code unit. K is then used
 *    as a key *whitelist at every object level*, so a nested key that is not also a top-level key is
 *    dropped. This behaviour is **frozen**: existing audit-chain rows were hashed with it, and
 *    changing it breaks every stored hash.
 * 2. `sortKeys` — recursive stable form: every object key is kept and sorted at every level, arrays
 *    are mapped, `undefined` object values fall out at `JSON.stringify` time. This is the shape of
 *    the idempotency key, the args digest and the confirmation render proof; changing it changes
 *    keys already stored in the database.
 *
 * They genuinely disagree on nested payloads — `{ a: { b: 1 } }` becomes `{"a":{}}` under the
 * protocol form (K is `["a"]`) and `{"a":{"b":1}}` under the recursive form. That is a contract
 * difference, not a bug, and the two must never be wired into each other. `canonical-json.drift.spec.ts`
 * pins both the agreement *within* each family and this deliberate difference *across* them.
 *
 * 本仓使用的两种规范序列化 —— 同一个家，且**不可互换**。凡是对载荷求哈希或签名的实现都从这里取，
 * 不再各带一份拷贝。
 *
 * 1. `canonicalJSON` —— 协议 §2.3：**K** = 顶层值不为 `undefined` 的键，按 UTF-16 code unit 升序；
 *    K 随后在**每个对象层**作键白名单，故嵌套对象里不在 K 中的键会被丢弃。该行为**已冻结**：
 *    既有审计链行是用它算出的哈希，改它会让全部已存哈希失效。
 * 2. `sortKeys` —— 递归稳定形态：每一层的对象键都保留并排序，数组逐元素映射，对象值为 `undefined`
 *    的键在 `JSON.stringify` 时自然消失。幂等键、参数摘要与确认渲染凭据用的都是它；改它会改变
 *    数据库里已经存下的键。
 *
 * 两者在嵌套载荷上**确实不同** —— `{ a: { b: 1 } }` 在协议形态下是 `{"a":{}}`（K 只有 `["a"]`），
 * 在递归形态下是 `{"a":{"b":1}}`。这是契约差异而非缺陷，二者绝不能互相接线。
 * `canonical-json.drift.spec.ts` 同时钉住「同族实现逐字节一致」与「跨族刻意不同」。
 */

/**
 * Protocol §2.3 canonical JSON (top-level key sort + undefined removal + K as a whitelist at every
 * object level). Frozen: audit-chain hashes depend on it.
 *
 * 协议 §2.3 规范 JSON（顶层键排序 + 剔除 undefined + 每个对象层以 K 作白名单）。已冻结：审计链哈希依赖它。
 */
export function canonicalJSON(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).filter((k) => payload[k] !== undefined).sort();
  return JSON.stringify(payload, keys);
}

/**
 * Recursively sort object keys so the same logical value always serialises to the same string.
 * Every key is preserved (unlike `canonicalJSON`'s whitelist); `undefined` object values are
 * dropped by `JSON.stringify`.
 *
 * 递归排序对象键，使同一逻辑值总序列化为同一字符串。与 `canonicalJSON` 的白名单不同，这里**保留全部键**；
 * 对象值为 `undefined` 的键由 `JSON.stringify` 丢弃。
 */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      obj[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return obj;
  }
  return value;
}
