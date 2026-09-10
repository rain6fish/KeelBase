#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 术语单一真源闸（roadmap CE-1 C2 语义化：公开仓不含内部编号）：扫描协议文档与对外文档，
 * 拦截「第二套表述 / 过度承诺词」——确保 `ai-governance-protocol.md`（协议单一真源）与
 * `docs/manual/product-language.md`（产品语言词表）之外的对外文档不携带会漂移的第二套措辞。
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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../'); // Server-NestJS/scripts → 仓库根

/** 扫描对象：协议单一真源 + 对外语言载体（中英对照成对登记）。新增对外文档在此登记（缺失即 fail-loud）。 */
const SCANNED = [
  'docs/protocols/ai-governance-protocol.md',
  'docs/manual/product-language.md',
  'docs/manual/product-language-en.md',
  'README.md',
  'README.zh-CN.md',
  'docs/enterprise-capabilities.md',
  'docs/enterprise-capabilities-en.md',
  'docs/manual/capability-declaration.md',
  'docs/manual/capability-declaration-en.md',
];

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
];

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
        if (re.test(line)) {
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
