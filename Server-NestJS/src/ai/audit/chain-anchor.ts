// SPDX-License-Identifier: Apache-2.0

/**
 * Daily audit-chain anchor (`audit-chain-anchor` v1, `docs/hs11-audit-chain.spec.md` §6.1).
 *
 * A hash chain proves internal continuity only: `A→B→C` truncated to `A→B` is still a valid prefix,
 * so the chain alone cannot answer "was there more". This anchor records, at `observedAt`, each
 * chain's **hashed row count** and **last row** and signs that commitment with SM2; a later reader
 * compares the current chain with the signed tails and sees a deletion that the chain itself accepts.
 *
 * This is a **separate wire object** from `evidence-anchor` v1 on purpose. That one anchors a day's
 * set of evidence-package `root.digest`s; an optional chain-tail field on it would be a field a
 * producer may omit, which is the failure mode this object exists to remove. See the contract
 * CHANGELOG for v1.22.0.
 *
 * Coverage is bounded: only up to `observedAt`; only hashed rows (`hash` non-empty); and only when
 * someone outside the trust domain compares. An anchor kept in-house is an empty promise.
 *
 * 审计链日锚（`audit-chain-anchor` v1，`docs/hs11-audit-chain.spec.md` §6.1）。
 *
 * 哈希链只证明内部连续性：`A→B→C` 截成 `A→B` 仍是合法前缀，故链本身答不出「后面本来还有没有」。
 * 本锚在 `observedAt` 记下每条链的**已入链行数**与**末行**，并用 SM2 对这份承诺签名；后来的读者拿
 * 当前链与签名过的链尾对照，就能看见链自己会接受的那种删除。
 *
 * 它刻意是**独立 wire 对象**，不是 `evidence-anchor` v1 上的可选字段。后者锚的是某日一批证据包的
 * `root.digest` 集合；可选字段就是生产者可以省略的字段，而那正是本对象要消除的失效模式。契约
 * v1.22.0 的 CHANGELOG 记了这次决定。
 *
 * 覆盖有边界：只到 `observedAt`、只数已入链的行（`hash` 非空）、且必须有信任域之外的人来对照。
 * 自持锚是空心承诺。
 */
import { createHash } from 'node:crypto';
import { sortKeys } from '../../common/canonical-json';
import {
  Sm2SignatureBlock,
  buildSm2Block,
  sm2ConfigFromEnv,
  verifyCanonical,
} from '../../common/crypto/sm2';

export type ChainName = 'aiAudit' | 'operationAudit';

/** One chain's tail at `observedAt`: hashed row count + the row with the largest id. */
export interface ChainTail {
  rows: number;
  lastId: number;
  lastHash: string;
}

/** Wire shape: `specs/protocol/schemas/v1/audit-chain-anchor.schema.json`. */
export interface AuditChainAnchor {
  period: 'daily';
  /** UTC date (YYYY-MM-DD); must equal the date part of `observedAt`. */
  date: string;
  /** RFC3339 UTC instant the chains were read. The commitment is about this instant. */
  observedAt: string;
  /** RFC3339 UTC publication/declaration time; outside the signature, as in `evidence-anchor` v1. */
  publishedAt: string;
  chains: Record<ChainName, ChainTail | null>;
  /** sha256(JSON.stringify(sortKeys({period,date,observedAt,chains}))). */
  rootDigest: string;
  sm2: Sm2SignatureBlock;
  tsa?: { tokenUrl?: string; token?: string };
}

/** The minimum a row needs for tail derivation; matches `verifyChain`'s "hashed row" test. */
export interface ChainRowLike {
  id: number;
  hash?: string | null;
}

/** Rows that `verifyChain` counts: `hash` non-empty. Legacy rows (`hash` null) are not in the chain. */
export function isHashedRow(row: ChainRowLike): boolean {
  return typeof row.hash === 'string' && row.hash.length > 0;
}

/**
 * Derive a chain's tail from its rows. `null` means the chain has no hashed rows at all — distinct
 * from a zero-row tail, which the schema does not allow.
 *
 * 从行集合推导链尾。`null` 表示该链没有已入链的行 —— 与「0 行」不同，schema 不允许后者。
 */
export function tailsFromRows(rows: readonly ChainRowLike[]): ChainTail | null {
  let rowsCount = 0;
  let last: ChainRowLike | null = null;
  for (const row of rows) {
    if (!isHashedRow(row)) continue;
    rowsCount += 1;
    if (!last || row.id > last.id) last = row;
  }
  if (!last) return null;
  return { rows: rowsCount, lastId: last.id, lastHash: last.hash as string };
}

/** The signed payload: everything except `publishedAt`, `rootDigest`, `sm2` and `tsa`. */
function anchorPayload(anchor: Pick<AuditChainAnchor, 'period' | 'date' | 'observedAt' | 'chains'>): Record<string, unknown> {
  return { period: anchor.period, date: anchor.date, observedAt: anchor.observedAt, chains: anchor.chains };
}

/**
 * `rootDigest = sha256(JSON.stringify(sortKeys(payload)))`.
 *
 * `sortKeys`, not `canonicalJSON`: the latter uses the top-level key set as a whitelist at every
 * object level, which would drop `aiAudit` / `operationAudit` from `chains`. The recursive form keeps
 * every key and is deterministic.
 *
 * 用 `sortKeys` 而不是 `canonicalJSON`：后者以顶层键作每层白名单，会把 `chains` 里的
 * `aiAudit` / `operationAudit` 丢掉；递归形态保留全部键，且结果确定。
 */
export function chainAnchorRootDigest(
  anchor: Pick<AuditChainAnchor, 'period' | 'date' | 'observedAt' | 'chains'>,
): string {
  return createHash('sha256').update(JSON.stringify(sortKeys(anchorPayload(anchor)))).digest('hex');
}

const HEX64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function isTail(t: unknown): t is ChainTail {
  const tail = t as ChainTail;
  return (
    !!tail &&
    Number.isInteger(tail.rows) &&
    tail.rows >= 1 &&
    Number.isInteger(tail.lastId) &&
    tail.lastId >= 1 &&
    typeof tail.lastHash === 'string' &&
    HEX64.test(tail.lastHash)
  );
}

/**
 * Build an anchor. Refuses without an SM2 key: an unsigned anchor is not evidence, so producing one
 * that looks like evidence is worse than producing nothing.
 *
 * 产出锚。无 SM2 私钥时拒产：未签名的锚不构成证据，产出一个「看起来像证据」的东西比不产更糟。
 */
export function buildChainAnchor(opts: {
  date: string;
  observedAt: string;
  chains: Record<ChainName, ChainTail | null>;
  publishedAt?: string;
  /** Explicit config; omitted → read `SM2_PRIVATE_KEY` / `SM2_KEY_ID` / `SM2_USER_ID`. */
  sm2?: { privateKeyPem: string; keyId?: string; userId: string } | null;
  tsa?: { tokenUrl?: string; token?: string };
}): AuditChainAnchor {
  const cfg = opts.sm2 === undefined ? sm2ConfigFromEnv() : opts.sm2;
  if (!cfg) {
    throw new Error('审计链日锚需要 SM2 私钥（SM2_PRIVATE_KEY）——未签名的锚不构成可对外举证材料，故拒绝产出');
  }
  if (!DATE.test(opts.date)) throw new Error(`锚日期须 YYYY-MM-DD，实得 ${opts.date}`);
  if (!UTC_INSTANT.test(opts.observedAt)) throw new Error(`observedAt 须 RFC3339 UTC，实得 ${opts.observedAt}`);
  if (opts.observedAt.slice(0, 10) !== opts.date) {
    throw new Error(`date(${opts.date}) 与 observedAt 的 UTC 日期(${opts.observedAt.slice(0, 10)}) 不一致`);
  }
  const publishedAt = opts.publishedAt ?? new Date().toISOString();
  if (!UTC_INSTANT.test(publishedAt)) throw new Error(`publishedAt 须 RFC3339 UTC，实得 ${publishedAt}`);

  for (const name of ['aiAudit', 'operationAudit'] as const) {
    const tail = opts.chains[name];
    if (tail !== null && !isTail(tail)) {
      throw new Error(`${name} 的链尾非法：须 {rows>=1,lastId>=1,lastHash 64hex} 或 null`);
    }
  }

  const base = { period: 'daily' as const, date: opts.date, observedAt: opts.observedAt, chains: opts.chains };
  const rootDigest = chainAnchorRootDigest(base);
  const sm2 = buildSm2Block(rootDigest, cfg);
  if (!sm2) throw new Error('SM2 签名段产出失败'); // buildSm2Block 在 cfg 非空时不返回 null；此处仅收窄类型

  return {
    ...base,
    publishedAt,
    rootDigest,
    sm2,
    ...(opts.tsa ? { tsa: opts.tsa } : {}),
  };
}

/** Anchor self-verification result: `ok=false` explains each reason. */
export interface ChainAnchorVerifyResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Verify an anchor on its own (third-party view; only the public key is needed): payload shape,
 * `rootDigest` reproducible from the payload, and the SM2 signature over it. Like `verifyAnchor`,
 * the in-record public key is outside the signature and can be swapped with it, so an out-of-domain
 * verifier should pass its own trusted key.
 *
 * 独立校验一个锚（第三方视角，只需公钥）：形状、`rootDigest` 可由载荷复现、以及对其的 SM2 验签。
 * 与 `verifyAnchor` 一样，锚内公钥不在签名覆盖内、可与签名一起被替换，故域外验证方应传入自持公钥。
 */
export function verifyChainAnchor(
  anchor: AuditChainAnchor,
  opts: { publicKeyHex?: string } = {},
): ChainAnchorVerifyResult {
  const reasons: string[] = [];

  if (anchor.period !== 'daily') reasons.push(`period 须 daily，实得 ${String(anchor.period)}`);
  if (!DATE.test(anchor.date ?? '')) reasons.push('date 非法（须 YYYY-MM-DD）');
  if (!UTC_INSTANT.test(anchor.observedAt ?? '')) {
    reasons.push('observedAt 非法（须 RFC3339 UTC）');
  } else if (anchor.date && anchor.observedAt.slice(0, 10) !== anchor.date) {
    reasons.push(`date(${anchor.date}) 与 observedAt 的 UTC 日期(${anchor.observedAt.slice(0, 10)}) 不一致`);
  }
  if (!UTC_INSTANT.test(anchor.publishedAt ?? '')) reasons.push('publishedAt 非法（须 RFC3339 UTC）');

  const chains = anchor.chains as Record<string, unknown> | undefined;
  if (!chains || typeof chains !== 'object') {
    reasons.push('缺 chains');
  } else {
    for (const name of ['aiAudit', 'operationAudit'] as const) {
      if (!(name in chains)) reasons.push(`chains 缺 ${name}`);
      else if (chains[name] !== null && !isTail(chains[name])) {
        reasons.push(`${name} 的链尾非法（须 {rows>=1,lastId>=1,lastHash 64hex} 或 null）`);
      }
    }
  }

  if (!HEX64.test(anchor.rootDigest ?? '')) {
    reasons.push('rootDigest 非法（须 64 hex）');
  } else {
    try {
      const expected = chainAnchorRootDigest(anchor);
      if (anchor.rootDigest !== expected) {
        reasons.push(`rootDigest 与载荷不符（期望 ${expected}，实得 ${anchor.rootDigest}）`);
      }
    } catch (e) {
      reasons.push(`载荷无法复现 rootDigest：${(e as Error).message}`);
    }
  }

  const sm2 = anchor.sm2;
  if (!sm2 || typeof sm2.value !== 'string') {
    reasons.push('缺 sm2 签名段');
  } else {
    const pub = opts.publicKeyHex ?? sm2.publicKey;
    if (!sm2.publicKey) reasons.push('缺 sm2.publicKey');
    else if (opts.publicKeyHex && opts.publicKeyHex.toLowerCase() !== sm2.publicKey.toLowerCase()) {
      reasons.push('锚内 publicKey 与验证方信任公钥不一致——可能被替换（签名不覆盖该字段）');
    }
    try {
      const ok = verifyCanonical(anchor.rootDigest, pub, sm2.value, sm2.userId, sm2.encoding);
      if (!ok) reasons.push('SM2 验签不通过（rootDigest 被改 / 公钥或 userId 不符）');
    } catch (e) {
      // Missing openssl is an environment failure, not "signature invalid" and not "verified".
      // 缺 openssl 属环境不可用，不降级为「验签通过」，也不谎称「验签失败」。
      reasons.push(`${(e as Error).name}：${(e as Error).message}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export type ChainTailStatus =
  | 'ok'
  | 'empty'
  | 'grew'
  | 'tail-missing'
  | 'tail-replaced'
  | 'last-row-changed';

export interface ChainTailComparison {
  ok: boolean;
  status: ChainTailStatus;
  reasons: string[];
  anchored: ChainTail | null;
  current: ChainTail | null;
}

export interface ChainAnchorComparison {
  ok: boolean;
  reasons: string[];
  chains: Record<ChainName, ChainTailComparison>;
}

/**
 * Compare an anchor with the **current** rows (read-only). This is the half `verifyChainAnchor` does
 * not do: it answers whether the tail that was signed is still there.
 *
 * - `tail-missing`: the current chain has fewer hashed rows than the anchor, or none.
 * - `last-row-changed`: the anchored last row (`lastId`/`lastHash`) is gone or has another hash —
 *   this also catches a deletion of the anchored tail followed by new writes.
 * - `tail-replaced`: same row count, different last row.
 * - `grew`: more hashed rows than the anchor; not a deletion (the anchored last row must still
 *   match, checked above). Interior integrity is `verifyChain`'s job, not this comparison's.
 * - `empty` / `ok`: no change.
 *
 * 把锚与**当前**行集合对照（只读）。这是 `verifyChainAnchor` 不做的那一半：签名过的链尾还在不在。
 * `tail-missing` = 当前已入链行数少于锚 / 为空；`last-row-changed` = 锚定末行没了或 hash 变了（也能
 * 抓住「删掉锚定尾行后再写新行」）；`tail-replaced` = 行数相同但末行不同；`grew` = 锚后新增，不是删除
 * （锚定末行仍须匹配，上面已查）。链的内部完整性由 `verifyChain` 负责，不在本对照的职责内。
 */
export function verifyChainAnchorAgainst(
  anchor: AuditChainAnchor,
  current: Record<ChainName, readonly ChainRowLike[]>,
): ChainAnchorComparison {
  const compare = (name: ChainName): ChainTailComparison => {
    const anchored = anchor.chains?.[name] ?? null;
    const rows = current[name] ?? [];
    const currentTail = tailsFromRows(rows);

    if (!anchored) {
      if (!currentTail) {
        return { ok: true, status: 'empty', reasons: [], anchored: null, current: null };
      }
      return {
        ok: true,
        status: 'grew',
        reasons: [`${name}：锚定时为空，当前 ${currentTail.rows} 行（锚后新增，不是尾部删除）`],
        anchored: null,
        current: currentTail,
      };
    }

    if (!currentTail) {
      return {
        ok: false,
        status: 'tail-missing',
        reasons: [`${name}：锚定 ${anchored.rows} 行（末行 id=${anchored.lastId}），当前 0 行 —— 尾部缺失`],
        anchored,
        current: null,
      };
    }

    if (currentTail.rows < anchored.rows) {
      return {
        ok: false,
        status: 'tail-missing',
        reasons: [
          `${name}：锚定 ${anchored.rows} 行，当前 ${currentTail.rows} 行 —— 尾部缺失 ${anchored.rows - currentTail.rows} 行`,
        ],
        anchored,
        current: currentTail,
      };
    }

    const anchoredLast = rows.find((r) => r.id === anchored.lastId && isHashedRow(r));
    if (!anchoredLast) {
      return {
        ok: false,
        status: 'last-row-changed',
        reasons: [`${name}：锚定末行 id=${anchored.lastId} 在当前链中不存在 —— 末行被删`],
        anchored,
        current: currentTail,
      };
    }
    if (anchoredLast.hash !== anchored.lastHash) {
      return {
        ok: false,
        status: 'last-row-changed',
        reasons: [`${name}：锚定末行 id=${anchored.lastId} 的 hash 与锚不符 —— 末行被改`],
        anchored,
        current: currentTail,
      };
    }

    if (currentTail.rows === anchored.rows) {
      if (currentTail.lastId !== anchored.lastId || currentTail.lastHash !== anchored.lastHash) {
        return {
          ok: false,
          status: 'tail-replaced',
          reasons: [
            `${name}：行数与锚相同（${anchored.rows}），但末行由 id=${anchored.lastId} 变为 id=${currentTail.lastId} —— 尾部被替换`,
          ],
          anchored,
          current: currentTail,
        };
      }
      return { ok: true, status: 'ok', reasons: [], anchored, current: currentTail };
    }

    return {
      ok: true,
      status: 'grew',
      reasons: [
        `${name}：锚定 ${anchored.rows} 行，当前 ${currentTail.rows} 行（锚后新增 ${currentTail.rows - anchored.rows} 行，不是尾部删除）`,
      ],
      anchored,
      current: currentTail,
    };
  };

  const aiAudit = compare('aiAudit');
  const operationAudit = compare('operationAudit');
  const reasons = [...aiAudit.reasons, ...operationAudit.reasons];
  return {
    ok: aiAudit.ok && operationAudit.ok,
    reasons,
    chains: { aiAudit, operationAudit },
  };
}
