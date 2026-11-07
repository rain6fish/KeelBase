// SPDX-License-Identifier: Apache-2.0

/**
 * Cross-source consistency of an evidence root (`/3`, `/4`): the anchors a package says it stands on,
 * against the rows it actually carries.
 *
 * The evidence root packages several sources — authorization snapshot, decision evidence, AI audit
 * chain rows, the side-effect row, operation-audit chain rows, root anchors — and each was verified
 * on its own: every row's hash, the anchor digest, the package signature. Nothing checked that the
 * sections agree with each other. They are built from **different key spaces**: `chains.aiAudit` is
 * read by the effect's conversation, while the `ai-audit` anchor is the row the write's claim (or
 * conservative pairing) attributes the action to. Those two can name different rows, and the package
 * then anchors support it never carried — while every existing assertion still passes.
 *
 * This module is a **reading**: it adds no field to the package and does not touch the exporter.
 *
 * - `onlyDeclared` — the package says a stored row supports this action, but does not carry it (or
 *   carries the same id with a different hash). The support exists only as an assertion.
 * - `onlyStored` — the package carries a row it does not account for: the side-effect row with no
 *   side-effect anchor, or a chain-section row with no chain hash (carried as chain evidence, but not
 *   in any chain).
 *
 * Deliberately not reported: AI-audit rows carried as conversation context but not anchored. The
 * exporter anchors only the trigger row while `chains.aiAudit` carries the whole conversation, so an
 * unanchored **hashed** row is by design. Leaving that silence unstated is exactly what lets a reader
 * take it for completeness, so it is written down here.
 *
 * 证据根（`/3`、`/4`）的跨来源一致性：包**声称**它立在其上的锚，与它**实际携带**的行。
 *
 * 证据根把多个来源打进一个包 —— 授权快照、Decision Evidence、AI 审计链行、副作用行、
 * operation-audit 链行、根锚 —— 而此前每一段都是**单独**校验的：每行 hash、锚摘要、整包签名。
 * 没有任何一步检查各段之间是否相互一致。它们出自**不同的键空间**：`chains.aiAudit` 按副作用行的
 * 会话读，而 `ai-audit` 锚是占位行（或保守配对）把这次动作归因到的那一行。两者可以指向不同的行，
 * 于是包锚定了一份它从未携带过的支撑 —— 而既有的每一条断言仍然通过。
 *
 * 本模块只是一次**读数**：不给包加字段，也不碰导出侧。
 *
 * - `onlyDeclared` —— 包声称某条库里的行支撑这次动作，却没有携带它（或携带的同 id 行 hash 不同）。
 *   这份支撑只作为断言存在。
 * - `onlyStored` —— 包携带了一行却无法为它作保：有副作用行却没有副作用锚，或链段里有一行没有链 hash
 *   （被当作链证据携带，却不在任何链里）。
 *
 * **有意不报**：作为会话上下文携带、但未被锚定的 AI 审计行。导出侧只锚定触发行，而 `chains.aiAudit`
 * 携带整个会话，故「有 hash 却未入锚」是按设计如此。把这份沉默留给读者去猜，正是它会读成完整的原因，
 * 所以写在这里。
 */

const isChainHash = (hash) => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash);

/** Anchor kind → the section that would have to carry the row.
 *  锚类型 → 应当携带该行的那一段。 */
const SECTION_OF = { 'ai-audit': 'chains.aiAudit', 'op-audit': 'chains.operationAudit' };

function short(value) {
  return typeof value === 'string' && value ? `${value.slice(0, 12)}…` : String(value ?? null);
}

/**
 * Compare the package's anchor set with the rows it carries. Pure: no clock, no I/O.
 * 把包的锚集合与它携带的行对照。纯函数：不读时钟、不做 I/O。
 *
 * @param {object} pkg a `keelbase-audit-evidence/3` or `/4` package
 * @returns {{consistent: boolean, onlyDeclared: object[], onlyStored: object[]}}
 */
export function crossCheckEvidenceRoot(pkg) {
  const onlyDeclared = [];
  const onlyStored = [];
  const anchors = Array.isArray(pkg?.root?.anchors) ? pkg.root.anchors : [];
  const sections = {
    'ai-audit': Array.isArray(pkg?.chains?.aiAudit) ? pkg.chains.aiAudit : [],
    'op-audit': Array.isArray(pkg?.chains?.operationAudit) ? pkg.chains.operationAudit : [],
  };

  // Declared → carried: every anchor has to resolve to a row of the section it names.
  // 声明 → 携带：每条锚都必须在它点名的段里解析到一行。
  for (const anchor of anchors) {
    if (!anchor || typeof anchor !== 'object') continue;
    if (anchor.kind === 'side-effect') {
      const effectId = pkg?.effect?.id ?? null;
      const actionEffectId = pkg?.action?.effectId ?? null;
      if (anchor.rowId !== effectId || anchor.rowId !== actionEffectId) {
        onlyDeclared.push({
          kind: 'side-effect',
          rowId: anchor.rowId ?? null,
          reason: 'side_effect_anchor_not_the_packaged_effect',
          detail:
            `副作用锚指向行 ${anchor.rowId}，但包内 effect.id=${effectId}、` +
            `action.effectId=${actionEffectId}`,
        });
      }
      continue;
    }
    const carried = sections[anchor.kind];
    // An unknown anchor kind is not a shape this reader knows how to check. Skipping it is the
    // honest answer; inventing a rule would report a failure this code cannot justify.
    // 未知的锚类型不是本读者会校验的形状。跳过是诚实的答案；为它编一条判据会报出本模块无法自证的失败。
    if (!carried) continue;
    const row = carried.find((r) => r?.id === anchor.rowId);
    if (!row) {
      onlyDeclared.push({
        kind: anchor.kind,
        rowId: anchor.rowId ?? null,
        reason: 'anchor_row_not_carried',
        detail: `锚声明 ${anchor.kind}:${anchor.rowId}，但 ${SECTION_OF[anchor.kind]} 未携带该行`,
      });
    } else if (row.hash !== anchor.hash) {
      onlyDeclared.push({
        kind: anchor.kind,
        rowId: anchor.rowId ?? null,
        reason: 'anchor_hash_mismatch',
        detail:
          `锚与 ${SECTION_OF[anchor.kind]} 中同一行 ${anchor.rowId} 的 hash 不同` +
          `（锚 ${short(anchor.hash)} · 携带 ${short(row.hash)}）`,
      });
    }
  }

  // Carried → declared: a carried row the package gives no support for.
  // 携带 → 声明：包没有为它作保的携带行。
  const sideAnchored = anchors.some((anchor) => anchor?.kind === 'side-effect');
  const carriedEffectId = pkg?.effect?.id ?? pkg?.action?.effectId ?? null;
  if (!sideAnchored && carriedEffectId != null) {
    onlyStored.push({
      kind: 'side-effect',
      rowId: carriedEffectId,
      reason: 'side_effect_carried_not_anchored',
      detail: `包携带副作用行 ${carriedEffectId}，但根锚没有一条 side-effect 锚为它作保`,
    });
  }
  for (const [kind, rows] of Object.entries(sections)) {
    for (const row of rows) {
      if (!isChainHash(row?.hash)) {
        onlyStored.push({
          kind,
          rowId: row?.id ?? null,
          reason: 'carried_row_without_chain_hash',
          detail:
            `${SECTION_OF[kind]} 携带行 ${row?.id ?? '(无 id)'}，其 hash 不是 64 hex` +
            `（${JSON.stringify(row?.hash ?? null)}）—— 它不在任何链里，也无锚可依`,
        });
      }
    }
  }

  return { consistent: onlyDeclared.length === 0 && onlyStored.length === 0, onlyDeclared, onlyStored };
}
