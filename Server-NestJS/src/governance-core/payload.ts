// SPDX-License-Identifier: Apache-2.0

/**
 * The other chain's payload lives in `operation-audit/payload.ts`, and the two are deliberately not
 * the same shape — different columns, different chain. What they do share is the reasoning below
 * (one implementation per chain, so the two sides of a chain cannot compute different hashes) and
 * the rule about which rows take part in verification. Read one, read the other.
 *
 * 另一条链的 payload 在 `operation-audit/payload.ts`，两者的形态**有意不同** —— 不同的列、不同的链。
 * 它们共享的是下面那套理由（**每条链只有一个实现**，这样一条链的两侧不可能算出不同的 hash），以及
 * 「哪些行参与校验」那条口径。读其一，也读其二。
 */

/**
 * 审计链 payload 的规范形态——**单源**：写入（算 hash）、链校验、证据导出三处共用。
 *
 * 为什么提出来：它原本是 `AuditService` 的私有方法，但写入路径与证据域都要用它。
 * 拆出证据域时若复制一份，「什么进 payload、什么不进」这个决定就会有两个实现，
 * 而这类分叉**不会立刻报错**——只会让两边算出不同的 hash，等到验链失败才发现。
 *
 * G-2（§internal.17 ① G-2）分版本：
 *  - `payloadVersion === 2`（新行）→ 链外归责/意图/来源/业务注解列以**真实值**入 payload（DB 层篡改即破链）；
 *  - 历史行（无 `payload_version`）→ 维持 v1（上述注解恒空），既有链不破。
 *  `feedback`/`feedbackNote` 恒 null（submitFeedback 后置更新不重算 hash，防断链，同前）。
 */
export function buildPayload(row: object): Record<string, unknown> {
    const r = row as Record<string, unknown>;
    const v2 = r.payloadVersion === 2;
    return {
      userId: r.userId ?? null,
      conversationId: r.conversationId ?? null,
      action: r.action ?? null,
      detail: r.detail ?? null,
      model: r.model ?? null,
      provider: r.provider ?? null,
      promptTokens: r.promptTokens ?? null,
      completionTokens: r.completionTokens ?? null,
      durationMs: r.durationMs ?? null,
      isError: r.isError ?? false,
      errorMessage: r.errorMessage ?? null,
      authorization: r.authorization ?? null,
      feedback: null,
      feedbackNote: null,
      businessEvent: v2 ? (r.businessEvent ?? null) : null,
      evidence: v2 ? (r.evidence ?? null) : null,
      ...(v2
        ? {
            agentId: r.agentId ?? null,
            sessionId: r.sessionId ?? null,
            parentActionId: r.parentActionId ?? null,
            callerAgentId: r.callerAgentId ?? null,
            delegationContext: r.delegationContext ?? null,
            businessIntent: r.businessIntent ?? null,
            source: r.source ?? null,
          }
        : {}),
    };}
