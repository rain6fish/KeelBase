// SPDX-License-Identifier: Apache-2.0

/**
 * The `/1` / `/2` / `/5` evidence-package signature canonical, shared by the offline verifier and
 * the period-report renderer. Both used to carry the same object literal; the export side
 * (`src/governance-shared/services/audit-evidence.service.ts`) still writes it by hand because a Nest service cannot
 * import a script, and `scripts/check-evidence-canonical.mjs` pins that hand-written key order
 * against this module.
 *
 * **This is a fixed key order, not `canonicalJSON`.** The signed bytes have always been produced by
 * plain `JSON.stringify` over this literal; sorting the keys would change every stored signature.
 * Keep the literal shape and order exactly as written. `/5` adds `compliance` (as `/2` does) and
 * the signed `releaseReadings` section; `/1` and `/2` keep their historical bytes.
 *
 * `/1` / `/2` / `/5` 证据包签名的规范串，由离线验证侧与期间报告渲染件共用。两处原本各带一份同样的
 * 对象字面量；导出侧（`src/governance-shared/services/audit-evidence.service.ts`）仍手写一份 —— Nest
 * 服务无法 import 脚本 —— 由 `scripts/check-evidence-canonical.mjs` 把它的手写键序与本模块逐字对账。
 *
 * **这里是固定键序，不是 `canonicalJSON`。** 被签名的字节一直是普通 `JSON.stringify` 按此字面量键序
 * 产出的；排序键会改变所有已存签名。字面量形状与顺序须原样保持。`/5` 与 `/2` 一样含 `compliance`，
 * 并加入入签的 `releaseReadings` 段；`/1` 与 `/2` 保持其历史字节不变。
 */
export function evidencePackageCanonical(pkg) {
  return JSON.stringify({
    summary: pkg.report?.summary,
    hashChain: pkg.report?.hashChain,
    effectDiffs: pkg.report?.effectDiffs,
    ...(pkg.format === 'keelbase-audit-evidence/1' ? {} : { compliance: pkg.compliance }),
    chain: pkg.chain,
    ...(pkg.format === 'keelbase-audit-evidence/5' ? { releaseReadings: pkg.releaseReadings } : {}),
    exportedAt: pkg.exportedAt,
  });
}
