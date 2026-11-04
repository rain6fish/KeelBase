// SPDX-License-Identifier: Apache-2.0

/**
 * 证据根定期锚（docs/evidence-root.spec.md §11.3，D-4b）。
 *
 * 把**某一日全部证据包的 `root.digest` 集合**聚合成单一 `rootDigest` 并加国密 SM2 签名，交**信任域之外**
 * 的渠道发布/接收。作用：给散落的证据包一个共同时间点——第三方持公钥即可验「这批包同属该日、发布后未被替换」。
 *
 * **聚合算法（§11.3 未定，此处补全并冻结）**：`rootDigest = sha256(JSON.stringify(digests))`，
 * 其中 `digests` 为**升序去重**的 64hex 数组。确定性是重点——同一集合必得同一 rootDigest，第三方可复现。
 * 若不给聚合输入，rootDigest 无法被独立复现，锚就不可验（那就退化成「请相信我们」）。
 *
 * **信任域红线**（执行包 §6.2）：锚必须离开 KeelBase 同信任域才有意义（自持锚 = 空心承诺）。
 * 本模块只负责**产出与签名**，发布/接收渠道由部署方选定（N-2 已把「可信时间戳/密钥托管」划为部署方义务）。
 *
 * **措辞红线**（执行包 §6.1）：本能力提升的是**第三方可验性**，不新增「不可抵赖 / 不可篡改」承诺。
 *
 * **它回答的正是链答不了的那一问（三层口径见 `docs/hs11-audit-chain.spec.md` §6.1）**：哈希链只能证明
 * **内部连续性** —— `A→B→C` 截成 `A→B` 仍是合法前缀、照样通过；而锚把**某日那批包的集合**固定下来并签名
 * 外发，事后删包或删行会让「今天的集合」与「当时发布的 rootDigest」对不上，尾部删除这才可被察觉。
 * **两个前提**：只覆盖**确实锚定过**的日子、且只覆盖**纳入聚合**的那些包；并且**必须真的有人在域外比对**
 * （自持锚是空心承诺，发布与密钥托管属部署方义务，N-2）。长期保全（WORM）是第三件独立的事，本仓不做。
 *
 * **This is the layer that answers the question the chain cannot**: the hash chain proves **internal
 * continuity** only — `A→B→C` truncated to `A→B` is still a valid prefix — whereas the anchor fixes the
 * **set of packages for a day** and publishes it signed, so deleting a package or a row afterwards makes
 * today's set disagree with the published `rootDigest`, which is what makes a tail deletion noticeable.
 * Two conditions: it covers only days that were anchored and only the packages included in the
 * aggregation, and it means something only if someone outside the trust domain actually compares (an
 * anchor kept in-house is an empty promise — publication and key custody are the deployer's duty, N-2).
 * Long-term preservation (WORM) is a third, separate thing this repository does not build.
 */
import { createHash } from 'node:crypto';
import { Sm2SignatureBlock, buildSm2Block, sm2ConfigFromEnv, verifyCanonical } from '../../common/crypto/sm2';

/** 定期锚记录（wire 契约：specs/protocol/schemas/v1/evidence-anchor.schema.json）。 */
export interface EvidenceAnchor {
  period: 'daily';
  /** 被锚定的 UTC 日期（YYYY-MM-DD）。 */
  date: string;
  /** 参与聚合的 root.digest 集合（升序去重）。 */
  digests: string[];
  count: number;
  /** = sha256(JSON.stringify(digests))。 */
  rootDigest: string;
  /** 锚生成/发布时刻，RFC3339 UTC（§11.3 格式冻结）。**声明时间**——可验性来自签名 + 信任域外发布。 */
  publishedAt: string;
  sm2: Sm2SignatureBlock;
  /** 可选 RFC3161 可信时间戳（C 档 opt-in；需客户自有合规 TSA，信创场景用国内 TSA）。 */
  tsa?: { tokenUrl?: string; token?: string };
}

/** 证据包里锚需要的最小形状（避免依赖 audit.service 的内部类型）。 */
export interface AnchorSourcePackage {
  exportedAt?: string;
  root?: { digest?: string };
}

const HEX64 = /^[0-9a-f]{64}$/;

/** 规范化聚合输入：校验 + 升序去重（顺序无关、重复无关 → 集合语义）。 */
export function normalizeDigests(digests: readonly string[]): string[] {
  const out: string[] = [];
  for (const d of digests) {
    if (typeof d !== 'string' || !HEX64.test(d)) {
      throw new Error(`根锚输入含非法 root.digest（须 64 hex）：${JSON.stringify(d)}`);
    }
    out.push(d);
  }
  return [...new Set(out)].sort();
}

/** 聚合根摘要 = sha256(JSON.stringify(升序去重后的 digests))。 */
export function aggregateRootDigest(digests: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(normalizeDigests(digests))).digest('hex');
}

/** 从证据包集合按导出日期（UTC）分组抽取 root.digest。缺 exportedAt / root.digest 的包被跳过。 */
export function groupDigestsByDate(packages: readonly AnchorSourcePackage[]): Map<string, string[]> {
  const byDate = new Map<string, string[]>();
  for (const p of packages) {
    const digest = p.root?.digest;
    const exportedAt = p.exportedAt;
    if (typeof digest !== 'string' || typeof exportedAt !== 'string') continue;
    const date = exportedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const list = byDate.get(date) ?? [];
    list.push(digest);
    byDate.set(date, list);
  }
  return byDate;
}

/**
 * 产出某一日的锚记录。**无 SM2 私钥时抛错**——锚的价值即在其签名，未签名的锚不构成对外举证材料
 * （执行包 §6.4「缺库不静默」的同一原则：不产出看起来像证据的非证据）。
 */
export function buildAnchor(opts: {
  date: string;
  digests: readonly string[];
  publishedAt?: string;
  /** 显式配置；省略则读环境（SM2_PRIVATE_KEY / SM2_KEY_ID / SM2_USER_ID）。 */
  sm2?: { privateKeyPem: string; keyId?: string; userId: string } | null;
  tsa?: { tokenUrl?: string; token?: string };
}): EvidenceAnchor {
  const cfg = opts.sm2 === undefined ? sm2ConfigFromEnv() : opts.sm2;
  if (!cfg) {
    throw new Error('根锚需要 SM2 私钥（SM2_PRIVATE_KEY）——未签名的锚不构成可对外举证材料，故拒绝产出');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) throw new Error(`锚日期须 YYYY-MM-DD，实得 ${opts.date}`);

  const digests = normalizeDigests(opts.digests);
  const rootDigest = aggregateRootDigest(digests);
  const sm2 = buildSm2Block(rootDigest, cfg);
  if (!sm2) throw new Error('SM2 签名段产出失败'); // buildSm2Block 在 cfg 非空时不返回 null；此处仅收窄类型

  return {
    period: 'daily',
    date: opts.date,
    digests,
    count: digests.length,
    rootDigest,
    publishedAt: opts.publishedAt ?? new Date().toISOString(),
    sm2,
    ...(opts.tsa ? { tsa: opts.tsa } : {}),
  };
}

/** 锚自校验结果：`ok=false` 时 `reasons` 逐条说明。 */
export interface AnchorVerifyResult {
  ok: boolean;
  reasons: string[];
}

/** Anchor coverage result: `missing` = anchored but absent now (removed after anchoring).
 * 锚集合对照结果：`missing` = 锚里有、当前集合没有的 digest（锚定之后被删的那些）。 */
export interface AnchorCoverageResult extends AnchorVerifyResult {
  missing: string[];
  /** Present now but not anchored — produced after anchoring; not a failure.
   * 当前集合有、锚里没有 —— 锚定之后才产生的包；本身不构成失败。 */
  extra: string[];
}

/**
 * Compare the anchored digest set with the current one (read-only; produces nothing, adds no schema
 * field, changes no external behaviour).
 *
 * `verifyAnchor` only proves the anchor record itself was not changed (digests/rootDigest agree and
 * the signature holds); it does not answer "is everything still there". This function answers that:
 * an anchored digest absent from the current set is the reading left when the corresponding
 * evidence package was deleted after anchoring — and when the deleted row is a chain row covered by
 * that package's root anchors (e.g. the trigger ai-audit row), that is a tail deletion observable at
 * the anchor layer.
 *
 * Coverage is bounded by the anchor's two conditions: only days that were anchored, and only the
 * packages included in the aggregation. A chain row outside every anchored package stays invisible
 * to this check; that layer needs the anchor itself to commit to the chain tail, which today's
 * `EvidenceAnchor` record does not carry.
 *
 * 把锚记录的 digest 集合与**当前**集合对照（只读；不产出、不改 schema、不改对外行为）。
 *
 * `verifyAnchor` 只证明**锚自身**未被改（digests 与 rootDigest 自洽、签名有效）；它不回答
 * 「锚定之后东西还在不在」。本函数补上这一问：锚中某个 digest 在当前集合里缺席，就是锚定之后
 * 对应证据包被删的读数 —— 而当被删的那一行正是包根锚覆盖的链行时（例如触发该动作的 ai-audit 行），
 * 这就是尾部删除在锚层留下的证据。
 *
 * 覆盖边界与锚的两个前提一致：只对**确实锚定过**的日子、且只对**被纳入聚合**的那些包有效。
 * 不在任何锚定包里的链行被删，本函数看不见 —— 那一层需要锚本身承诺链尾（当前 `EvidenceAnchor`
 * 没有该字段）。
 */
export function verifyAnchorCoverage(
  anchor: EvidenceAnchor,
  currentDigests: readonly string[],
): AnchorCoverageResult {
  let anchored: string[];
  let current: string[];
  try {
    anchored = normalizeDigests(Array.isArray(anchor.digests) ? anchor.digests : []);
    current = normalizeDigests(currentDigests);
  } catch (e) {
    return { ok: false, reasons: [`digest 集合含非法值：${(e as Error).message}`], missing: [], extra: [] };
  }

  const currentSet = new Set(current);
  const anchoredSet = new Set(anchored);
  const missing = anchored.filter((d) => !currentSet.has(d));
  const extra = current.filter((d) => !anchoredSet.has(d));

  const reasons: string[] = [];
  if (missing.length > 0) {
    reasons.push(
      `锚记录的 ${missing.length} 个 digest 在当前集合中缺失（锚定之后证据包/尾部行被删，尾部缺失）：` +
        missing.map((d) => `${d.slice(0, 16)}…`).join(', '),
    );
  }
  return { ok: missing.length === 0, reasons, missing, extra };
}

/**
 * 独立校验一个锚记录（第三方视角，只需公钥）：
 *  1. rootDigest 可由 digests 复现（聚合算法自洽）；2. count 与集合大小一致；
 *  3. SM2 签名对 rootDigest 有效。
 * `publicKeyHex` 省略时用锚内 publicKey——但**锚内公钥在签名覆盖范围之外**，可被连同签名一起替换，
 * 故对外举证场景应由验证方自持公钥传入（与 verify-evidence.mjs 的 --sm2-pubkey 同理）。
 */
export function verifyAnchor(
  anchor: EvidenceAnchor,
  opts: { publicKeyHex?: string } = {},
): AnchorVerifyResult {
  const reasons: string[] = [];
  const digests = Array.isArray(anchor.digests) ? anchor.digests : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor.date ?? '')) reasons.push('date 非法（须 YYYY-MM-DD）');
  if (anchor.count !== digests.length) reasons.push(`count(${anchor.count}) 与 digests 长度(${digests.length}) 不一致`);
  let expected: string | null = null;
  try {
    expected = aggregateRootDigest(digests);
  } catch (e) {
    reasons.push(`digests 含非法值：${(e as Error).message}`);
  }
  if (expected && anchor.rootDigest !== expected) {
    reasons.push(`rootDigest 与 digests 聚合不符（期望 ${expected}，实得 ${anchor.rootDigest}）`);
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
      // 缺 openssl 属环境不可用，不降级为「验签通过」，也不谎称「验签失败」——单独归类
      reasons.push(`${(e as Error).name}：${(e as Error).message}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
