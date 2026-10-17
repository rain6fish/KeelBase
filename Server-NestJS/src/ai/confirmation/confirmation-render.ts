// SPDX-License-Identifier: Apache-2.0

/**
 * CONF-3 — the confirmation row records **what the user was shown**, not only what they approved.
 *
 * A confirmation row has always bound the tool name and the exact arguments. It never bound the
 * *rendering* of those arguments. The summary is a deterministic function of (tool name, args) —
 * `ToolPresentationService.writeSummary` — and both clients also render the raw arguments verbatim.
 * Recomputing that from the stored args after the fact therefore yields **today's** rendering: change
 * a mapping in the renderer, or a translation in either client, and the old row silently "renders" as
 * something the user never saw.
 *
 * This module pins the rendering with a SHA-256 over a canonical form of exactly the payload that was
 * emitted at issue time (tool name + presentation text + arguments), plus the identifier of the
 * renderer generation that produced it. Alongside the args already on the row, that answers "what was
 * on screen then" without storing the rendered text itself, and makes drift visible: recompute under
 * the current renderer and the hash no longer matches.
 *
 * Canonical JSON (recursively sorted keys, `undefined` dropped) is used so key insertion order can
 * never change the hash. The version string enters the hashed payload as well; bumping the renderer
 * generation alone is enough to make an old row's proof fail against the new renderer — which is the
 * intended, visible outcome, not a false alarm.
 *
 * CONF-3 —— 确认行记录**用户当时看到的是什么**，而不只是批的是什么。
 *
 * 确认行一直绑着工具名与精确参数，却从未绑住这些参数的**渲染**。摘要本就是（工具名，参数）的确定性
 * 函数 —— `ToolPresentationService.writeSummary`，而且两个客户端还会原样渲染原始参数。于是事后用存下
 * 的参数重算，得到的是**今天**的渲染：改一处渲染映射、改一端的一条翻译，旧行就静默「渲染」成用户从未
 * 见过的样子。
 *
 * 本模块用 SHA-256 钉住签发时实际下发的载荷（工具名 + 呈现文案 + 参数）的规范形式，并附带产生它的
 * 渲染代次标识。配合行上已有的参数，这就能回答「当时屏幕上是什么」，而**不必**存渲染文本本身；同时让
 * 漂移可见：用今天的渲染重算，哈希不再相等。
 *
 * 规范 JSON（递归排序键、丢弃 `undefined`）保证键的插入顺序永远不改变哈希。版本串也计入哈希载荷，
 * 故只抬渲染代次就足以让旧行的凭据在新渲染器下对不上 —— 这正是**期望的可见结果**，不是误报。
 */
import { createHash } from 'node:crypto';
import { PresentationText } from '../interfaces/tool.interface';

/**
 * The renderer generation that produced a confirmation preview.
 *
 * Single source: bump this constant whenever the deterministic preview changes in a way that alters
 * what a user sees (summary mapping, fallback text, argument preview shape). It is **not** a schema
 * version and is not exposed on the wire; it only labels the hash stored on the row.
 *
 * 产生确认预览的渲染代次。
 *
 * 单一来源：只要会改变用户所见（摘要映射、兜底文案、参数预览形状），就抬这个常量。它**不是** schema
 * 版本，也不上 wire；只用来给行上存的哈希贴标签。
 */
export const CONFIRMATION_RENDER_VERSION = 'confirmation-preview-v1';

/** Hash + the renderer generation it was computed under, exactly as stored on the row. */
export interface ConfirmationRenderProof {
  renderVersion: string;
  renderHash: string;
}

/** One action inside a run batch, as it was rendered when the batch was issued. */
export interface RenderedRunItem {
  toolName: string;
  args: Record<string, unknown>;
  summary: PresentationText;
}

/**
 * Recursively sort object keys and drop `undefined`, so the same logical payload always serialises
 * to the same string regardless of construction order.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

function sha256(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
}

function summaryPayload(summary: PresentationText): PresentationText {
  // Explicit field pick: a future renderer-only addition to PresentationText must not silently
  // change the hash of older proofs unless the renderer generation is bumped with it.
  return {
    key: summary.key,
    fallback: summary.fallback,
    ...(summary.params !== undefined ? { params: summary.params } : {}),
  };
}

/**
 * Proof for a single-action confirmation: the summary that was sent, plus the raw arguments both
 * clients render.
 */
export function buildConfirmationRenderProof(
  toolName: string,
  args: Record<string, unknown>,
  summary: PresentationText,
): ConfirmationRenderProof {
  return {
    renderVersion: CONFIRMATION_RENDER_VERSION,
    renderHash: sha256({
      renderVersion: CONFIRMATION_RENDER_VERSION,
      toolName,
      summary: summaryPayload(summary),
      arguments: args,
    }),
  };
}

/**
 * Proof for a run-level confirmation: every item's rendered summary and arguments, in rendered order.
 */
export function buildRunRenderProof(items: RenderedRunItem[]): ConfirmationRenderProof {
  return {
    renderVersion: CONFIRMATION_RENDER_VERSION,
    renderHash: sha256({
      renderVersion: CONFIRMATION_RENDER_VERSION,
      toolName: 'run',
      items: items.map((item) => ({
        toolName: item.toolName,
        summary: summaryPayload(item.summary),
        arguments: item.args,
      })),
    }),
  };
}
