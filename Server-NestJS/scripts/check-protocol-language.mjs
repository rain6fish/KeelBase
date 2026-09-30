#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 术语单一真源闸（roadmap CE-1 C2 语义化：公开仓不含内部编号）：扫描协议文档与对外文档，
 * 拦截「第二套表述 / 过度承诺词」——确保 `ai-governance-protocol.md`（协议单一真源）与
 * `docs/manual/product-language.md`（产品语言词表）之外的对外文档不携带会漂移的第二套措辞。
 *
 * 扫描面（2026-09-30 起）：**登记式**对外文档 + **枚举式**全部公开 spec（`docs/*.spec.md`）——
 * 后者是 ACT-10「语义轴」的落点，见 SCANNED 上方的注释与 RULES 的 `semantic-overpromise` 条。
 *
 * The single-source terminology gate: scans the protocol documents and outward documents for a
 * second set of wording and for over-promises. Since 2026-09-30 its surface is the registered
 * outward documents plus every public spec (`docs/*.spec.md`, enumerated) — the latter is where
 * ACT-10's semantic axis lives; see the note above SCANNED and the `semantic-overpromise` rule in RULES.
 *
 * 只 import Node 内置，确定性、可 CI。禁词表见 RULES（扩展：加一行 {id, pattern, reason}）。
 * 权威词表：docs/manual/product-language.md；协议语义：docs/protocols/ai-governance-protocol.md。
 *
 * 用法（cd Server-NestJS）：
 *   node scripts/check-protocol-language.mjs          # 扫描，发现违规 exit 1
 *   node scripts/check-protocol-language.mjs --list   # 打印禁词表与扫描文件清单
 *   node scripts/check-protocol-language.mjs --allow <id[,id]>  # 豁免个别规则（谨慎，标注理由）
 */
import { readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../'); // Server-NestJS/scripts → 仓库根

/**
 * Registered scan targets: the protocol single source + outward language carriers (zh/en paired).
 * Register new outward documents here — a wrong path or a renamed document then fails loudly
 * instead of being skipped, which would make this gate green-on-nothing.
 *
 * 登记式扫描对象：协议单一真源 + 对外语言载体（中英对照成对登记）。新增对外文档在此登记 ——
 * 路径写错或文档改名会**大声失败**，否则本闸会假绿（等于没扫）。
 */
const REGISTERED = [
  'docs/protocols/ai-governance-protocol.md',
  'docs/manual/product-language.md',
  'docs/manual/product-language-en.md',
  'README.md',
  'README.zh-CN.md',
  'docs/enterprise-capabilities.md',
  'docs/enterprise-capabilities-en.md',
  'docs/manual/capability-declaration.md',
  'docs/manual/capability-declaration-en.md',
  // 信任面的规格（ACT-11 ②，2026-09-28）：链 / 锚 / 证据包这几篇是「过度承诺」的高发处，
  // 也是 ACT-8 那类「链扛了不该它扛的承诺」出现的地方，故纳入扫描面。
  // The trust-claim specs: the chain / anchor / evidence-package documents are where over-promises appear
  // (and where ACT-8's "the chain was carrying a promise that is not its to make" lived).
  'docs/hs11-audit-chain.spec.md',
  'docs/evidence-report.spec.md',
  'docs/evidence-root.spec.md',
  'docs/period-audit-report.spec.md',
  'docs/protocol-trust-proof-card.spec.md',
];

/**
 * Public specs are **enumerated, not registered**: `docs/*.spec.md` is a whole class, so reading the
 * directory means a new spec falls under the gate the moment it lands. A deleted spec shrinks the
 * surface deliberately; `--list` prints whatever set results. Measured before widening the surface
 * (2026-09-30): the three rules that existed then produced **zero** hits across all 52 specs, so this
 * costs nothing today. The spec surface is where ACT-10's "semantic axis" lives — see RULES.
 *
 * 公开 spec 走**枚举**而非登记：`docs/*.spec.md` 是一整类，读目录意味着新 spec 一落地即受本闸管辖；
 * 删除 spec 会**有意**缩小扫描面，`--list` 会打印实际得到的集合。放宽扫描面之前已实测（2026-09-30）：
 * 当时既有的三条规则在**全部 52 份 spec** 上**零命中**，故今天纳入不付代价。ACT-10 的「语义轴」就在
 * 这个面上 —— 见 RULES。
 */
const PUBLIC_SPECS = readdirSync(resolve(ROOT, 'docs'))
  .filter((f) => f.endsWith('.spec.md'))
  .sort()
  .map((f) => `docs/${f}`);

/**
 * The handbooks are enumerated the same way, and for the same reason: they are outward documents, and
 * the rules that guard over-promises apply to them as much as to the capabilities page. Measured before
 * widening (2026-09-30): over all 76 handbooks the four rules produce **zero** violations once the word
 * list's existing exemption is applied — the only two raw hits are in `product-language.md`, which
 * `skipFiles` already exempts because recording forbidden wording is that file's job.
 *
 * 手册同样按目录**枚举**，理由相同：它们是**对外文档**，守过度承诺的规则对它们与对能力页一样成立。
 * 放宽前已实测（2026-09-30）：在全部 76 份手册上，四条规则在**词表文档既有豁免**生效后**零违规** ——
 * 仅有的两处原始命中都在 `product-language.md`，而 `skipFiles` 本就豁免它（记录禁用词正是那份文件的职责）。
 */
const MANUALS = readdirSync(resolve(ROOT, 'docs/manual'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => `docs/manual/${f}`);

/** Deduplicate: several handbooks are already registered above, and a duplicate would report twice. */
const SCANNED = [...new Set([...REGISTERED, ...PUBLIC_SPECS, ...MANUALS])];

/** 词表文档：其职能就是**记录**越界/禁用词（changelog 里引用 tamper-proof 等），故两条规则均豁免。 */
const WORD_LIST_DOCS = ['docs/manual/product-language.md', 'docs/manual/product-language-en.md'];

/**
 * 禁词规则。原则：只收**无歧义**的第二套/过度承诺表述，避免误报；
 * pattern 为 RegExp 源（大小写不敏感统一 /i）。skipFiles 用共享词表常量（避免只挂一条规则而另一条误报词表自身）。
 */
const RULES = [
  {
    id: 'audit-absolutes',
    pattern: '不可篡改|不可抵赖|tamper[- ]?proof',
    skipFiles: WORD_LIST_DOCS,
    reason:
      '审计哈希链只承诺「篡改即断链 + 应用边界内可离线验证」，不承诺不可篡改/不可抵赖（边界见 docs/protocols/ai-governance-protocol.md §2 与 docs/manual/product-language.md「Audit Hash Chain」行）。',
  },
  {
    id: 'blockchain',
    pattern: '\\bblockchain\\b|区块链',
    skipFiles: WORD_LIST_DOCS, // 词表文档在「≠ 区块链」澄清中合法提及，与 audit-absolutes 同豁免
    reason: '审计哈希链 ≠ 区块链：不允许用区块链/blockchain 指代链式 HMAC 审计（技术事实失真）。',
  },
  {
    id: 'chain-append-only',
    pattern: 'append[- ]?only|只能追加',
    skipFiles: WORD_LIST_DOCS,
    reason:
      '链不承载「只能追加」：哈希链证明的是**内部连续性**（`verifyChain` 自 `prevHash = null` 起算，故截断后仍是合法前缀，尾巴被删检不出）。防尾部回滚/删除的是**外部锚**，长期保全是第三层 —— 见 docs/hs11-audit-chain.spec.md §6.1 与 SECURITY.md N-15。'
      + ' / The chain does not carry "append-only": it proves internal continuity; a truncated chain is a valid prefix. The external anchor is what answers "was there more".',
  },
  {
    id: 'semantic-overpromise',
    pattern: '永不丢失|绝不丢失|保证不丢|零丢失|永不失败|始终可用|永不中断|保证送达|保证一致|任何情况下|永不降级|绝不降级|保证可用',
    skipFiles: WORD_LIST_DOCS,
    reason:
      '这些搭配在**本架构里本身就是过度承诺**（数据/消息不丢、永远可用、任何情况下），今天**全库零命中** —— 收它，是为了让将来写下的第一处立刻被拦。'
      + ' **为什么只收搭配、不收 `保证`/`始终`/`永不` 本身**：2026-09-30 实测过通用词闸（否定双向 + 引号提及跳过）—— 全部 spec 面上 8 处断言只有 1 处无锚点，且那 1 处是文风规定；已扫描面上 4 处全是在用绝对句的正常散文（如 README.zh-CN 的验收条目）。'
      + ' 通用词闸要么假红要么失明，故**不建**；这一条只收「没有任何合法用法」的那些。'
      + ' / These collocations are over-promises **in this architecture** and appear nowhere in the repo today; the rule exists so the first one written is caught.'
      + ' A generic gate on 保证/始终/永不 was prototyped on 2026-09-30 and rejected: across every spec its single hit was a style rule, and on the scanned surface all four hits were ordinary prose. It would be false-red or blind, so only the collocations with no legitimate use are collected.',
  },
];

/**
 * 否定语境：命中若落在**否定从句**里就不算违规 —— 规则打的是**断言**，不是**免责声明**。
 *
 * 为什么需要它（ACT-11 ② 落地时的实测结论）：把规格纳入扫描面后，现有两条规则的命中**全部**是
 * 「不承诺『不可篡改』」「卡不验证：…、不可抵赖存储」这类**声明边界**的句子 —— 也就是这个仓**最该保留**
 * 的那种写法。没有这一层，闸会把做对了的文档判红（正是本仓反复警惕的「假红」），而真正的过度承诺反而
 * 淹没在误报里。
 *
 * 语境怎么取 —— **按句子边界，不按字符距离**：从命中往回看到**最近的句末标点**（。；！？ 或 `. ` / `; `），
 * 这段里出现否定词即算被否定。这样：
 *   · 「卡不验证：A、B、不可抵赖存储」—— 否定在**列表头**，与命中同属一句 ⇒ 不违规 ✓（字符窗口要么够
 *     不到、要么大到会把真断言也吞掉，句界是更准的判据）；
 *   · 「本系统不存明文。审计链不可篡改。」—— 第二句自成一句、里面没有否定 ⇒ **违规** ✓（这正是距离窗口
 *     会漏掉的那类：前句的否定被错误地算到后句头上）。
 *
 * A hit inside a **negated clause** is not a violation — the rules target **assertions**, not disclaimers.
 * Measured when this was built: every hit over the spec corpus was a boundary statement
 * ("does not promise 'tamper-proof'"; "the card does not verify: … non-repudiable storage").
 *
 * The context is taken by **sentence boundary rather than character distance**: walk back to the nearest
 * sentence terminator, and a negation anywhere in that clause counts. A distance window is either too
 * short for a negation at the head of a list, or long enough to swallow a genuine assertion made after an
 * unrelated earlier "not".
 */
const NEGATION = /(?:不|非|无|未|禁止|不得|永不|never|not|non-|without|no\s)/i;

/** 命中之前的**当句**片段（按句末标点切，跨过冒号/顿号）。 */
function clauseBefore(line, index) {
  const head = line.slice(0, index);
  const cuts = ['。', '；', '！', '？', '. ', '; '].map((t) => head.lastIndexOf(t));
  const cut = Math.max(...cuts);
  return cut === -1 ? head : head.slice(cut + 1);
}

/** 该行上是否存在**至少一次**不在否定从句里的命中。 */
function hasAssertiveHit(line, re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  let m;
  while ((m = global.exec(line)) !== null) {
    if (!NEGATION.test(clauseBefore(line, m.index))) return true;
    if (m.index === global.lastIndex) global.lastIndex += 1; // 零宽命中的兜底，防死循环
  }
  return false;
}

function run({ list, allow }) {
  const allowed = new Set(allow.split(',').filter(Boolean));
  if (list) {
    console.log('── 术语闸禁词表（check-protocol-language.mjs）──');
    for (const r of RULES) {
      console.log(`  [${r.id}] /${r.pattern}/ — ${r.reason}`);
    }
    console.log('── 扫描文件清单 ──');
    for (const f of SCANNED) console.log(`  · ${f}`);
    return;
  }

  // fail-loud：SCANNED 是「必须存在」的登记表——路径写错/文档改名若被静默跳过，本闸会假绿（等于没扫）
  const missing = SCANNED.filter((rel) => !existsSync(resolve(ROOT, rel)));
  if (missing.length > 0) {
    console.error('\n═══ 术语单一真源：SCANNED 登记文件缺失（会导致闸假绿）═══');
    for (const rel of missing) console.error(`  ✗ ${rel}（不存在）`);
    console.error('修正：恢复该文件，或从 SCANNED 移除该登记。');
    process.exit(1);
  }

  let violations = 0;
  for (const rel of SCANNED) {
    const file = resolve(ROOT, rel);
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (const r of RULES) {
      if (allowed.has(r.id)) continue;
      if (r.skipFiles?.includes(rel)) continue;
      const re = new RegExp(r.pattern, 'i');
      lines.forEach((line, i) => {
        if (hasAssertiveHit(line, re)) {
          violations += 1;
          console.log(`  ✗ ${rel}:${i + 1} 命中 [${r.id}]（${line.trim().slice(0, 120)}）`);
        }
      });
    }
  }

  if (violations > 0) {
    console.error(`\n═══ 术语单一真源：${violations} 处违规（第二套/过度承诺表述）═══`);
    console.error('修正：改回协议/词表权威表述；确属允许则用 --allow <id> 并附理由于 commit。');
    process.exit(1);
  }
  console.log('── 术语单一真源：无违规（协议文档 + 对外文档一致）──');
}

const argv = process.argv.slice(2);
run({ list: argv.includes('--list'), allow: argv.includes('--allow') ? argv[argv.indexOf('--allow') + 1] ?? '' : '' });
