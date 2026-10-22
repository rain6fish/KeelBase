#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0

/**
 * Audit-vocabulary gate — the three links that make an audit row read as a sentence.
 *
 * `check-tool-label-parity.mjs` walks one direction of the chain: metadata → dictionaries. Its
 * header explains why that direction is one-way (tool names also arrive from systems this repo does
 * not register, and labelling those is correct). But the other end was unguarded, and 2026-10-16
 * measured what that costs: six generated-module tools were **registered, visible in `/ai/tools`,
 * and had no business label at all** — and `effect_revoke` was the one action value without a label.
 * Neither turned anything red, because nothing compared the registry against the metadata, or the
 * action union against the labels. So a generated module was free to keep arriving unlabelled.
 *
 * Four links, all needed before a row reads as a sentence:
 *   1. **Registry → metadata** — every registered tool has business metadata (else the label falls
 *      back to the raw tool name).
 *   2. **Action union → labels** — every `AuditEntry.action` value has a label (else `AI · effect_revoke`).
 *   3. **Label key → both dictionaries** — every label the two above can emit resolves in zh and en
 *      (else the console shows the English fallback to a Chinese reader).
 *   4. **Coverage-gap id → both dictionaries** — same link for the coverage statement's gaps. The
 *      comment on that block says why it is the quietest of the four.
 *
 * Fail-closed: a parser that finds nothing is an error, never a smaller table. The floors below are
 * the trip-wire — they exist because a gate that silently stops matching is worse than no gate.
 *
 * 审计词汇闸 —— 让一条审计记录读起来像一句话的**三个环节**。
 *
 * `check-tool-label-parity.mjs` 走的是这条链的一个方向：元数据 → 字典。它的文件头解释了那个方向为何
 * 单向（工具名也会来自本仓不注册的系统，给它们配标签是对的）。但**另一端一直没人守**，而 2026-10-16
 * 把代价量出来了：**六个生成模块的工具注册了、在 `/ai/tools` 里看得见、却一个业务标签都没有**；而
 * `effect_revoke` 是唯一没有标签的动作取值。两处**都不红任何闸** —— 因为没有任何东西比对「注册表 ↔
 * 元数据」或「动作取值 ↔ 标签」。于是下一个生成的模块**可以继续沉默地不配标签**。
 *
 * 四个环节，缺一条，记录就读不成一句话：
 *   1. **注册表 → 元数据** —— 每个注册工具都有业务元数据（否则标签回落成裸工具名）。
 *   2. **动作取值 → 标签** —— 每个 `AuditEntry.action` 取值都有标签（否则 `AI · effect_revoke`）。
 *   3. **标签 key → 两个字典** —— 上面两条能发出的 key 在 zh / en 都取得到（否则中文读者看到英文兜底）。
 *   4. **缺口 id → 两个字典** —— 覆盖声明那一条同理。为什么它是最安静的一环，见那一节的注释。
 *
 * **fail-closed**：解析出空集是**错误**、不是「更小的表」。下面那些下限就是绊线 —— 因为一道**悄悄
 * 不再匹配的闸，比没有闸更糟**。
 *
 * 用法：node scripts/check-audit-vocabulary.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const problems = [];
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(2);
};

/** 递归取某目录下所有 `*.tool.ts`。 */
function toolFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...toolFiles(p));
    else if (e.name.endsWith('.tool.ts')) out.push(p);
  }
  return out;
}

// ── 真源 1：注册表（工具目录下的 `readonly name = '…'`）──────────────────────────
const TOOLS_DIR = join(ROOT, 'Server-NestJS/src/ai/tools');
if (!existsSync(TOOLS_DIR)) die('找不到 Server-NestJS/src/ai/tools —— 闸的射程已经不对了');

const registered = new Set();
for (const f of toolFiles(TOOLS_DIR)) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/readonly\s+name\s*=\s*'([a-z0-9_]+)'/g)) registered.add(m[1]);
}
// 绊线：注册表不可能这么小。数量掉了，说明抽取规则与源码形状脱节了。
if (registered.size < 20) {
  die(`只解析出 ${registered.size} 个工具名（下限 20）—— 抽取规则已与 \`*.tool.ts\` 的形状脱节，闸本身失效`);
}

// ── 真源 2：TOOL_METADATA ──────────────────────────────────────────────────────
const mdSrc = read('Server-NestJS/src/ai/audit/tool-metadata.ts');
const mdStart = mdSrc.indexOf('export const TOOL_METADATA');
if (mdStart < 0) die('tool-metadata.ts 里找不到 `export const TOOL_METADATA`');
const mdTable = mdSrc.slice(mdStart);
const metadata = new Set([...mdTable.matchAll(/^ {2}([a-z][a-z0-9_]*): \{/gm)].map((m) => m[1]));
if (metadata.size < 20) die(`只解析出 ${metadata.size} 条元数据（下限 20）—— 闸本身失效`);

// 环节 1：注册了就必须有元数据。元数据里有、注册表里没有 = 另一端的事（那个方向允许，见 `external`）。
for (const name of [...registered].sort()) {
  if (!metadata.has(name)) {
    problems.push(`注册但没有业务元数据：${name}（标签会回落成裸工具名）`);
  }
}

// ── 真源 3：动作联合类型 ────────────────────────────────────────────────────────
const auditSrc = read('Server-NestJS/src/governance-shared/services/audit.service.ts');
const actionUnion = auditSrc.match(/action:\s*((?:'[a-z_]+'\s*\|\s*)*'[a-z_]+')\s*;/);
if (!actionUnion) die('audit.service.ts 里解析不到 `AuditEntry.action` 的联合类型 —— 闸本身失效');
const actions = [...actionUnion[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
if (actions.length < 5) die(`只解析出 ${actions.length} 个动作取值（下限 5）—— 闸本身失效`);

// ── 真源 4：ACTION_LABELS ──────────────────────────────────────────────────────
const fmSrc = read('Server-NestJS/src/ai/audit/ai-feature-map.ts');
const fmStart = fmSrc.indexOf('const ACTION_LABELS');
if (fmStart < 0) die('ai-feature-map.ts 里找不到 `const ACTION_LABELS`');
const fmBlock = fmSrc.slice(fmStart, fmSrc.indexOf('\n};', fmStart));
const labelled = new Set([...fmBlock.matchAll(/^ {2}([a-z_]+):\s*\{/gm)].map((m) => m[1]));
if (labelled.size < 5) die(`只解析出 ${labelled.size} 条动作标签（下限 5）—— 闸本身失效`);

// 环节 2：每个可能被写进行里的动作取值都要有标签。
for (const a of actions) {
  if (!labelled.has(a)) {
    problems.push(`动作取值没有标签：${a}（渲染成兜底 \`AI · ${a}\`）`);
  }
}

// ── 环节 3：标签 key 在两个字典里都取得到 ────────────────────────────────────────
const labelKeys = [...fmBlock.matchAll(/key:\s*'(ai\.[A-Za-z0-9_]+)'/g)].map((m) => m[1]);
if (labelKeys.length < 5) die(`只解析出 ${labelKeys.length} 个标签 key（下限 5）—— 闸本身失效`);

const DICTS = { zh: 'Web-Admin-Vue/src/i18n/zh.ts', en: 'Web-Admin-Vue/src/i18n/en.ts' };
for (const [locale, rel] of Object.entries(DICTS)) {
  const src = read(rel);
  // 用字典自己的写法判在场，而不是拼一个通用正则：这里只要「这个 key 有没有被定义」。
  const missing = labelKeys.filter((k) => !new RegExp(`'${k.replace('.', '\\.')}'\\s*:`).test(src));
  for (const k of missing) {
    problems.push(`${locale} 字典缺动作标签：${k}`);
  }
}

// ── 环节 4：覆盖声明的缺口 id 也要在两个字典里取得到 ─────────────────────────────
// The coverage statement renders `gaps[].id` through the dictionary and falls back to the English
// `statement`. Without this link a new gap added to the registry would reach a Chinese reader in
// English — silently, because the fallback is a correct-looking sentence, not an error.
// 覆盖声明按 `gaps[].id` 取字典、没有词条时回落英文 `statement`。少了这一节，往登记表里加一条缺口，
// 中文读者会看到一句**英文** —— 而且是**静默**的，因为那句回落读起来是一句通顺的话，不是错误。
const gapSrc = read('Server-NestJS/src/governance-core/coverage-gaps.ts');
const gapStart = gapSrc.indexOf('export const COVERAGE_GAPS');
if (gapStart < 0) die('coverage-gaps.ts 里找不到 `export const COVERAGE_GAPS`');
const gapEnd = gapSrc.indexOf('\n];', gapStart);
const gapBlock = gapSrc.slice(gapStart, gapEnd < 0 ? undefined : gapEnd);
const gapIds = [...gapBlock.matchAll(/^ {4}id: '([a-z0-9-]+)',$/gm)].map((m) => m[1]);
if (gapIds.length === 0) die('缺口登记表解析出 0 条 —— 抽取规则已与 coverage-gaps.ts 的形状脱节，闸本身失效');

for (const [locale, rel] of Object.entries(DICTS)) {
  const src = read(rel);
  for (const id of gapIds) {
    // Matched at **root indentation** on purpose. `t('coverageGap_x')` resolves from the message root,
    // so an entry nested under `feature` (or any other object) is invisible to it while still being
    // present in the file — the key renders literally and nothing else notices. Requiring the two
    // spaces is what turns that into a red gate; it was found that way on 2026-10-16.
    // **按根缩进**匹配是有意的：`t('coverageGap_x')` 从消息根解析，所以嵌在 `feature`（或任何别的对象）
    // 里的词条**文件里有、它却看不见** —— key 会原样显示，而别的东西都不会注意到。要求那两个空格，正是
    // 把这种情况变成红闸的东西；2026-10-16 就是这么发现它的。
    if (!new RegExp(`^  'coverageGap_${id}':`, 'm').test(src)) {
      problems.push(`${locale} 字典缺覆盖声明词条（或没放在根级）：coverageGap_${id}`);
    }
  }
}

// ── 结论 ───────────────────────────────────────────────────────────────────────
if (problems.length) {
  console.error('✗ 审计词汇闸未通过：\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  真源：工具名 ← `Server-NestJS/src/ai/tools/**/*.tool.ts`；元数据 ← `ai/audit/tool-metadata.ts`');
  console.error('        动作取值 ← `governance-shared/services/audit.service.ts` 的 `AuditEntry.action`；标签 ← `ai/audit/ai-feature-map.ts`');
  console.error('  另一个方向（元数据 → 三个字典）由 `npm run check:tool-labels` 守。');
  process.exit(1);
}

console.log(
  `✓ 审计词汇闸通过：注册工具 ${registered.size} 个全有元数据 · 动作取值 ${actions.length} 个全有标签 · ` +
    `${labelKeys.length} 个标签 key 在 zh / en 都在场 · 覆盖声明缺口 ${gapIds.length} 条在 zh / en 都在场`,
);
