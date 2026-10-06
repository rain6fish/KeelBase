// SPDX-License-Identifier: Apache-2.0

/**
 * The operation-audit chain's payload shape — the **single source** for the decision "which fields
 * enter the hash". The write path (computing the hash) and both read paths (chain verification and
 * the evidence-root export) all go through here.
 *
 * Why it was extracted: that decision used to exist twice inside this one chain — an inline object
 * literal built from the entry at write time, and a private method for reading a stored row. They
 * had to agree, and a divergence would not fail loudly: it would only make the two sides compute
 * different hashes, surfacing later as a broken chain. The AI chain's `ai/audit/payload.ts` was
 * extracted for the same reason and says the same thing; the binding test next door ties this key
 * set to the frozen `operation-audit-payload` schema, and now covers the write path too — the
 * inline literal had no such binding before.
 *
 * Two neighbouring facts, written down so neither is re-derived:
 *  - Truncation is **not** here. `requestBody` / `ip` / `userAgent` are truncated by the caller
 *    *before the row is stored*, and the payload reads back whatever was stored.
 *  - The AI chain carries its own, deliberately different field set. The two chains are not meant
 *    to agree on fields; what they must agree on is the rule about what belongs in a chain payload
 *    at all, and about which rows take part in verification.
 *
 * 操作审计链的 payload 形态 —— 「哪些字段进哈希」这个决定的**单源**。写入（算 hash）与两条读路径
 * （链校验、证据根导出）都走这里。
 *
 * 为什么提出来：这个决定在**同一条链内**原本有**两份** —— 写入时由 entry 内联构造的对象字面量，
 * 以及读取已存行时的一个私有方法。两者必须一致，而一旦分叉**不会立刻报错**：只会让两边算出不同的
 * hash，等到验链失败才暴露。AI 链的 `ai/audit/payload.ts` 因同样的理由被提出来、写着同样的话；
 * 隔壁那条绑定测试把这个键集钉在冻结的 `operation-audit-payload` schema 上，如今**连写入路径
 * 一并覆盖**——此前那个内联字面量没有任何绑定。
 *
 * 另有两件相邻的事实，写在这里免得被重新推导：
 *  - 截断**不在这里**。`requestBody` / `ip` / `userAgent` 由调用方在**落库前**截断，payload 读回
 *    什么就是存了什么。
 *  - AI 链装的是它自己、**有意不同**的字段集。两条链并不需要在字段上取得一致；它们必须一致的是
 *    「什么才配进链 payload」这条规则，以及「哪些行参与校验」这条口径。
 */
export function buildOperationPayload(source: object): Record<string, unknown> {
  const r = source as Record<string, unknown>;
  return {
    userId: r.userId ?? null,
    action: r.action ?? null,
    method: r.method ?? null,
    path: r.path ?? null,
    featureKey: r.featureKey ?? null,
    featureFallback: r.featureFallback ?? null,
    targetId: r.targetId ?? null,
    requestBody: r.requestBody ?? null,
    ip: r.ip ?? null,
    userAgent: r.userAgent ?? null,
    statusCode: r.statusCode ?? null,
  };
}
