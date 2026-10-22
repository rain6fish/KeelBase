#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Governance → AI import ratchet.
 *
 * S4-H4-C drives the governance console's dependency on `Server-NestJS/src/ai/**` to zero. Until that is
 * done, the imports that exist today are the baseline: one MORE `../ai` import fails the gate, while one
 * FEWER only prints a hint and never fails (a ratchet only turns one way). The baseline is an explicit
 * list of `file :: statement` pairs, not just a number — a regression then names the file, the line and
 * the symbol it added, instead of silently moving a counter.
 *
 * The scan resolves every relative import/export/require specifier in `src/governance/**\/*.ts` (spec
 * files included: a test that reaches into `../ai` keeps the coupling alive) plus `src/config/governance-*.ts`
 * — the governance console's own wiring, which lives outside that directory — and counts the ones that
 * land inside `src/ai/`. Comment-only mentions are ignored.
 *
 * 治理 → AI 的 import 棘轮。
 *
 * S4-H4-C 的目标是把治理台对 `Server-NestJS/src/ai/**` 的依赖清零。在那之前，今天存在的 import 就是
 * 基线：**多一条** `../ai` import 就红，**少一条**只打印提示、不失败（棘轮只往一个方向转）。基线写成
 * `文件 :: 语句` 的明确清单而不是一个数字 —— 回退时能点名加了哪个文件、哪一行、哪个符号，而不是让
 * 计数悄悄变大。
 *
 * 扫描解析 `src/governance/**\/*.ts` 里每个相对 import/export/require 的说明符（含 spec 文件：测试伸进
 * `../ai` 同样让耦合活着），外加 `src/config/governance-*.ts` —— 治理台自己的接线（治理 DataSource
 * 在这里，只扫 src/governance 会漏掉它），统计落在 `src/ai/` 里的那些。只在注释里出现的提及不算。
 *
 * Usage (repository root): node scripts/check-governance-imports.mjs
 * Exit code: 0 = no new import and no baseline drift upward; 1 = a new import appeared.
 * 用法（仓库根）：node scripts/check-governance-imports.mjs
 * 退出码：0 = 没有新增 import；1 = 出现了基线之外的新 import。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'Server-NestJS', 'src');
const GOVERNANCE = path.join(SRC, 'governance');
const CONFIG = path.join(SRC, 'config');
const AI = path.join(SRC, 'ai');
/**
 * Governance wiring files under src/config: the console's own DataSource, and anything else named the
 * same way.
 * src/config 下的治理接线文件：治理台自己的 DataSource，以及任何同样命名的文件。
 */
const CONFIG_WIRING = /^governance-.*\.ts$/;

/**
 * Baseline as of 2026-10-22, measured on `main` (d093d65d).
 *
 * Each entry is `file :: the import statement, verbatim`. Files under src/governance are named relative
 * to that directory; files under src/config carry a `config/` prefix. Keys carry the statement rather
 * than a line number so unrelated edits above an import do not invalidate the baseline. When an import
 * is genuinely retired, delete its line here (the gate prints which ones are stale). Never add a line
 * without saying in the commit message why the coupling has to grow; the point of the ratchet is that
 * it cannot grow by accident.
 *
 * 2026-10-22 的基线，在 `main`（d093d65d）实测。
 *
 * 每条是 `文件 :: import 语句原文`。`src/governance` 下的文件按该目录的相对路径记；`src/config` 下的
 * 文件带 `config/` 前缀。键用语句而不是行号，这样 import 上方无关的改动不会让基线失效。真的解掉一条
 * import 时把对应行删掉（闸会打印哪些已失效）。**不要**在没有在提交信息里说明「耦合为何必须变多」的
 * 情况下加行；棘轮的意义就是不让它无意间长大。
 *
 * Baseline note (2026-10-22, S4-H4 C Step 2): the seven shared entities moved to
 * `src/governance-shared/entities/`, retiring the six `governance.module.ts` entity imports, the
 * two `governance-approval.service{,.spec}.ts` `AiConfirmationRequest` imports, and the seven
 * `config/governance-data-source.ts` entity imports.
 *
 * 基线说明（2026-10-22，S4-H4 C 第二步）：七个共享实体搬进 `src/governance-shared/entities/`，
 * 随之退役 `governance.module.ts` 六条实体 import、`governance-approval.service{,.spec}.ts` 两条
 * `AiConfirmationRequest`、以及 `config/governance-data-source.ts` 七条实体 import。
 *
 * Baseline note (2026-10-22, S4-H4 C Step 3): `AiAgentService` and `GovernancePolicyService` moved to
 * `src/governance-shared/services/`, so the two `governance.module.ts` imports and the
 * `GovernancePolicyService` imports in `governance.controller{,.spec}.ts` and
 * `external-governance.controller{,.spec}.ts` are retired.
 *
 * 基线说明（2026-10-22，S4-H4 C 第三步）：`AiAgentService` 与 `GovernancePolicyService` 搬进
 * `src/governance-shared/services/`，随之退役 `governance.module.ts` 两条 import，以及
 * `governance.controller{,.spec}.ts`、`external-governance.controller{,.spec}.ts` 里的
 * `GovernancePolicyService` import。
 *
 * Baseline note (2026-10-22, S4-H4 C Step 4): `AuditService` moved to
 * `src/governance-shared/services/` and is provided by `GovernanceSharedModule`, retiring the
 * `AuditService` imports in `governance.module.ts` and `external-governance.controller{,.spec}.ts`.
 *
 * 基线说明（2026-10-22，S4-H4 C 第四步）：`AuditService` 搬进 `src/governance-shared/services/`，
 * 改由 `GovernanceSharedModule` 提供，随之退役 `governance.module.ts` 与
 * `external-governance.controller{,.spec}.ts` 里的 `AuditService` import。
 */
const BASELINE = [
  ['external-governance.controller.spec.ts', "import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';"],
  ['external-governance.controller.ts', "import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';"],
  ['governance.controller.spec.ts', "import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';"],
  ['governance.controller.ts', "import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';"],
  ['governance.module.ts', "import { AuditStatsService } from '../ai/audit/audit-stats.service';"],
  ['governance.module.ts', "import { AuditQueryService } from '../ai/audit/audit-query.service';"],
  ['governance.module.ts', "import { AuditEvidenceService } from '../ai/audit/audit-evidence.service';"],
  ['governance.module.ts', "import { CoverageService } from '../ai/audit/coverage.service';"],
  ['governance.module.ts', "import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';"],
  ['governance.module.ts', "import { LocalEntityRevoker, SIDE_EFFECT_REVOKER } from '../ai/tool-effects/side-effect-revoker';"],
  ['governance.module.ts', "import { AuditController } from '../ai/audit/audit.controller';"],
  ['governance.module.ts', "import { AgentsController } from '../ai/agents/agents.controller';"],
].map(([file, statement]) => `${file} :: ${statement}`);

/** Recursively list `.ts` files under a directory, in a stable order. 递归列出目录下的 `.ts` 文件，顺序稳定。 */
function listTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Drop block comments and whole-line `//` comments so a commented-out import is not counted. A trailing
 * `//` comment after real code is left alone (we only need the quoted specifier).
 * 去掉块注释与整行 `//` 注释，避免把注释掉的 import 算进来；代码行尾的 `//` 保留（只需要引号里的说明符）。
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const toPosix = (p) => p.split(path.sep).join('/');

if (!fs.existsSync(GOVERNANCE)) {
  console.error(`[governance-imports] src/governance 不存在 —— 目录被改名或移走了？`);
  console.error(`[governance-imports] src/governance does not exist — renamed or moved?`);
  process.exit(1);
}
if (!fs.existsSync(CONFIG)) {
  console.error(`[governance-imports] src/config 不存在 —— 治理接线文件的扫描根失去落点。`);
  console.error(`[governance-imports] src/config does not exist — the wiring scan root has nothing to scan.`);
  process.exit(1);
}
if (!fs.existsSync(AI)) {
  console.error(`[governance-imports] src/ai 不存在 —— 本闸的判据（离开 src/ai 的 import）失去意义。`);
  console.error(`[governance-imports] src/ai does not exist — this gate's predicate no longer means anything.`);
  process.exit(1);
}

// Both roots, each with the display name its baseline entries use: src/governance files are named
// relative to that directory, src/config wiring files carry a `config/` prefix.
// 两个扫描根，各带基线里使用的显示名：src/governance 下的文件按该目录相对路径，src/config 下的接线文件
// 带 `config/` 前缀。
const scanTargets = listTsFiles(GOVERNANCE).map((file) => ({
  file,
  rel: toPosix(path.relative(GOVERNANCE, file)),
}));
for (const name of fs.readdirSync(CONFIG).sort()) {
  if (!CONFIG_WIRING.test(name)) continue;
  const file = path.join(CONFIG, name);
  if (!fs.statSync(file).isFile()) continue;
  scanTargets.push({ file, rel: `config/${name}` });
}

const current = [];
for (const { file, rel } of scanTargets) {
  const stripped = stripComments(fs.readFileSync(file, 'utf8')).split(/\r?\n/);
  stripped.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//')) return;
    // Only statements that pull something in: import/export ... from '...', bare import '...', dynamic
    // import('...'), require('...').
    // 只看「把东西拉进来」的语句：import/export ... from、裸 import、动态 import()、require()。
    if (!/\b(import|export|require)\b/.test(line)) return;
    const specifiers = [...line.matchAll(/['"](\.[^'"]*)['"]/g)].map((m) => m[1]);
    for (const specifier of specifiers) {
      const resolved = path.resolve(path.dirname(file), specifier);
      if (resolved === AI || resolved.startsWith(AI + path.sep)) {
        current.push({ file: rel, line: index + 1, statement: line, specifier });
      }
    }
  });
}

const keyOf = (e) => `${e.file} :: ${e.statement}`;
const baselineCount = new Map();
for (const key of BASELINE) baselineCount.set(key, (baselineCount.get(key) ?? 0) + 1);

const seen = new Map();
for (const entry of current) {
  const key = keyOf(entry);
  seen.set(key, (seen.get(key) ?? 0) + 1);
  if ((baselineCount.get(key) ?? 0) < seen.get(key)) {
    entry.isNew = true;
  }
}

const added = current.filter((e) => e.isNew);
const stale = [];
for (const key of baselineCount.keys()) {
  if (!seen.has(key)) stale.push(key);
}

console.log(
  `[governance-imports] baseline ${BASELINE.length} / current ${current.length} ` +
    `(${new Set(current.map((e) => e.file)).size} files, spec files included)`,
);

if (added.length > 0) {
  console.error(`\n✗ ${added.length} 个新的 ../ai import（基线之外）：`);
  console.error(`✗ ${added.length} new ../ai import(s) outside the baseline:\n`);
  for (const e of added) {
    console.error(`  ${e.file}:${e.line}  ${e.statement}`);
  }
  console.error(
    `\n治理目录正在重新耦合到 src/ai —— S4-H4-C 的方向是清零，不是增长。` +
      `\n把依赖移到 governance-core（或从治理侧注入），而不是把这条 import 加进基线。` +
      `\nThe governance directory is coupling back to src/ai — S4-H4-C heads to zero, not upward.` +
      `\nMove the dependency to governance-core (or inject it), instead of adding this import to the baseline.` +
      `\n\n若耦合确属必要，须在提交信息里说明理由并同步更新 scripts/check-governance-imports.mjs 的 BASELINE。` +
      `\nIf it is genuinely necessary, state why in the commit message and update BASELINE in scripts/check-governance-imports.mjs.\n`,
  );
  process.exit(1);
}

if (stale.length > 0) {
  console.log(`\nℹ 基线里 ${stale.length} 条已经不在代码里 —— 解耦有进展，可把 BASELINE 调小：`);
  console.log(`ℹ ${stale.length} baseline entr${stale.length === 1 ? 'y is' : 'ies are'} gone from the code — the ratchet can be lowered:\n`);
  for (const key of stale) console.log(`  ${key}`);
  console.log('');
}

console.log(
  `[governance-imports] 基线 ${BASELINE.length} / 实际 ${current.length}，无新增 ✓` +
    `  (baseline ${BASELINE.length} / actual ${current.length}, no additions ✓)`,
);
process.exit(0);
