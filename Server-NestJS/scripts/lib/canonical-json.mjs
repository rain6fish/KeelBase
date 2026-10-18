// SPDX-License-Identifier: Apache-2.0

/**
 * Protocol §2.3 canonical JSON for the standalone verifier.
 *
 * This is deliberately an **independent implementation of the written spec**, not an import of the
 * application's `src/common/canonical-json.ts` and not the contract repo's reference implementation.
 * `verify-evidence.mjs` is meant to be runnable by a third party from a checkout with Node built-ins
 * only, and its value is that it reaches the same bytes from the spec rather than replaying the
 * vendor's code. The copy is kept honest by `src/common/canonical-json.drift.spec.ts`, which feeds a
 * representative corpus to this module, the TypeScript implementation and the contract reference and
 * requires byte-identical output — divergence turns that gate red.
 *
 * 供离线验证脚本使用的协议 §2.3 规范 JSON。
 *
 * 这里刻意**按书面规格独立实现**，既不 import 应用的 `src/common/canonical-json.ts`，也不 import 契约仓的
 * 参考实现：`verify-evidence.mjs` 的定位是第三方只带 Node 内置、从检出即可运行，其价值正在于「照规格算出
 * 同一串字节」而不是重放厂商代码。本副本由 `src/common/canonical-json.drift.spec.ts` 看守 —— 它把代表性
 * 语料同时喂给本模块、TypeScript 实现与契约参考实现，要求输出逐字节一致；一旦漂移，该闸转红。
 */

/**
 * K = top-level keys whose value is not `undefined`, sorted by UTF-16 code unit; K is then used as
 * the key whitelist at every object level (protocol §2.3, frozen).
 *
 * K = 顶层值不为 `undefined` 的键，按 UTF-16 code unit 升序；K 随后在每个对象层作键白名单
 * （协议 §2.3，已冻结）。
 */
export function canonicalJSON(payload) {
  const keys = Object.keys(payload).filter((k) => payload[k] !== undefined).sort();
  return JSON.stringify(payload, keys);
}
