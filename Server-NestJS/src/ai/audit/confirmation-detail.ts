// SPDX-License-Identifier: Apache-2.0

/**
 * Confirmation decision detail — one parser for both readers.
 *
 * Two shapes are written by `ai.service.ts`, and both carry `action: 'tool_confirmation'`:
 *
 * - per-tool (`ai.service.ts:1259`): `toolName(argsJson) → outcome`, optionally ` (trusted)`
 * - run-level (`ai.service.ts:1103`): `run(<token>) <N> items → outcome`
 *
 * The two readers (the audit interpreter and the decision trace) each carried their own regex, and the
 * two had already drifted — closing anchor, `/s` flag, `trusted` capture. The drift was not cosmetic:
 * **neither** matched the run shape, so a run-level approval the user actually granted was reported as
 * `timeout` in both the compliance sentence and the trace step. Existing tests covered only the
 * per-tool shape, which is why it stayed invisible. Both readers now take their answer from here.
 *
 * 确认决策 detail —— 两个读取方共用一份解析。
 *
 * `ai.service.ts` 写出两种形状，且**都**带 `action: 'tool_confirmation'`：
 *
 * - 单条（`ai.service.ts:1259`）：`工具名(参数JSON) → 结果`，可带 ` (trusted)`
 * - run 级（`ai.service.ts:1103`）：`run(<token>) <N> items → 结果`
 *
 * 两个读取方（审计解释器、决策轨迹）原先各带一份正则，且**已经漂移** —— 收尾锚、`/s`、`trusted` 捕获。
 * 这漂移**不是外观问题**：两份都匹配不上 run 形状，于是一次用户**确实批准**的 run，在合规叙述与轨迹里
 * 都被报成 `timeout`。现有测试只覆盖单条形状，所以它一直不可见。两个读取方现在都从这里取答案。
 */

/** 与确认生命周期同一值域（approve | decline | timeout；见 `confirmation.store.ts`） */
export type ConfirmationOutcome = 'approve' | 'decline' | 'timeout';

export type ParsedConfirmation =
  | { kind: 'tool'; toolName: string; args?: string; outcome: ConfirmationOutcome; trusted: boolean }
  | { kind: 'run'; runId: string; items: number; outcome: ConfirmationOutcome };

/** 单条：`toolName(argsJson) → outcome [ (trusted)]`。两端锚定 + `/s`（参数里的换行不该让整行解析不出） */
const TOOL_CONFIRMATION_RE = /^([\w]+)\((.*)\)\s*→\s*(\w+)(?:\s*\((trusted)\))?$/s;

/** run 级：`run(<token>) <N> items → outcome`。token 是 `randomUUID()`，含连字符 */
const RUN_CONFIRMATION_RE = /^run\(([\w-]+)\)\s+(\d+)\s+items\s*→\s*(\w+)\s*$/;

/**
 * 认不出 → `null`。**刻意不在这里兜底成 `timeout`**：那是「未知被断言成已知」，而两个读取方对
 * 「认不出」各有自己的既有处置（解释器维持原句、轨迹回落成显示原文）。兜底留在消费方，本模块只报事实。
 */
export function parseConfirmation(detail?: string | null): ParsedConfirmation | null {
  const text = detail ?? '';

  const tool = TOOL_CONFIRMATION_RE.exec(text);
  if (tool) {
    return {
      kind: 'tool',
      toolName: tool[1],
      args: tool[2],
      outcome: outcomeOf(tool[3]),
      trusted: tool[4] === 'trusted',
    };
  }

  const run = RUN_CONFIRMATION_RE.exec(text);
  if (run) {
    return { kind: 'run', runId: run[1], items: Number(run[2]), outcome: outcomeOf(run[3]) };
  }

  return null;
}

function outcomeOf(raw: string | undefined): ConfirmationOutcome {
  return raw === 'approve' ? 'approve' : raw === 'decline' ? 'decline' : 'timeout';
}
