#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * The environment templates must carry what the config schema says — and a template you copy must boot.
 *
 * Two criteria, because the templates are not interchangeable:
 *
 * 1. **Every schema variable is in `.env.example`** — it is the copy-paste reference (`cp .env.example
 *    .env`), and a variable that exists only in the Joi schema is one a new deploy never learns about.
 *    Nothing compared the two, so they drifted: on 2026-10-11, 35 variables — `LOG_LEVEL`, the `OTEL_*` /
 *    `LOKI_*` pair, `PUSH_DRIVER`, the `THROTTLE_*` pair, the per-module `FEATURE_*` flags and others —
 *    were absent.
 * 2. **Every `.required()` variable is in *every* template** — staging and production load only
 *    `.env.<NODE_ENV>` with no `.env` fallback, so a template missing a required key produces an
 *    environment that refuses to start. `.env.staging.example` was missing `ENCRYPTION_KEY`.
 *
 * One direction only on criterion 1. The reverse is not a defect: the templates document variables the
 * schema does not carry because they are read straight from `process.env` (`PROXY_FETCH_TIMEOUT_MS`,
 * `SM2_*`, `TRUST_PROXY`), and flagging those would be a false positive.
 *
 * 环境模板必须带上配置 schema 说的东西 —— 且**拷一份就得起得来**。
 *
 * 两条判据，因为三份模板**不可互换**：
 *
 * 1. **schema 里的每个变量都在 `.env.example` 里** —— 它是「拷一份就能起」的参考模板（`cp .env.example
 *    .env`），而只活在 Joi schema 里的变量，新部署永远不会知道。没有东西比对它们，于是漂了：2026-10-11
 *    实测有 **35 个**变量（`LOG_LEVEL`、`OTEL_*`/`LOKI_*`、`PUSH_DRIVER`、`THROTTLE_*`、各模块
 *    `FEATURE_*` 等）不在里面。
 * 2. **每个 `.required()` 变量都在 \*每一份\* 模板里** —— staging / production **只加载 `.env.<NODE_ENV>`、
 *    没有 `.env` 兜底**，故模板缺一个必填键 = 造出一个**起不来**的环境。`.env.staging.example` 就缺
 *    `ENCRYPTION_KEY`。
 *
 * 判据 1 **只查一个方向**。反方向不是缺陷：模板会记一些 schema 不载、直接从 `process.env` 读的变量
 * （`PROXY_FETCH_TIMEOUT_MS`、`SM2_*`、`TRUST_PROXY`），报它们就是假阳性。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'Server-NestJS/src/config/env.config.ts';
const REFERENCE = 'Server-NestJS/.env.example';
const TEMPLATES = [REFERENCE, 'Server-NestJS/.env.production.example', 'Server-NestJS/.env.staging.example'];

/** Keys the schema declares — a line like `  FOO: Joi.string()...`, with its full expression.  schema 声明的键与其完整表达式。 */
const schema = new Map(
  [
    ...fs.readFileSync(path.join(ROOT, SCHEMA), 'utf8').matchAll(
      /^\s+([A-Z][A-Z0-9_]+):\s*(Joi\.[^\n]*)/gm,
    ),
  ].map((m) => [m[1], m[2]]),
);

/** Keys a template mentions, commented or not — a line like `# FOO=…` or `FOO=…`.  模板里出现（含注释）的键。 */
const keysIn = (file) =>
  new Set(
    [
      ...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]{2,})=/gm),
    ].map((m) => m[1]),
  );

const failures = [];

const referenceKeys = keysIn(REFERENCE);
for (const key of [...schema.keys()].sort()) {
  if (!referenceKeys.has(key)) failures.push(`${REFERENCE} 缺 schema 变量 ${key}`);
}

// A key is required when its Joi expression says so. Optional-by-default is Joi's own behaviour, so
// `required()` is the whole test — a missing `.default()` is not the same thing.
// 「必填」以 Joi 表达式自己写的 `.required()` 为准 —— Joi 本来就默认可选，没写 default ≠ 必填。
const required = [...schema.entries()].filter(([, expr]) => /\.required\(/.test(expr)).map(([k]) => k);
for (const file of TEMPLATES) {
  const keys = keysIn(file);
  for (const key of required) {
    if (!keys.has(key)) failures.push(`${file} 缺必填变量 ${key}（staging/production 只用 .env.<NODE_ENV>，缺它起不来）`);
  }
}

// 3. Every schema variable is in the reference a person or an agent reads before touching configuration
//    — `CLAUDE.md` §6.1. Its list had drifted 20 variables behind (the two JWT lifetimes, four
//    governance-database keys, `REVOKE_STALE_MINUTES`, the two audit-chain keys and eleven per-module
//    feature flags), which is the same failure as criterion 1 in a place nothing compared.
//
// 3. 每个 schema 变量都在「改配置之前会读的那份参考」里 —— `CLAUDE.md` §6.1。它的清单曾悄悄落后 **20** 个
//    变量（两个 JWT 有效期、四个治理库键、`REVOKE_STALE_MINUTES`、两个审计链密钥、十一个各模块开关），
//    与判据 1 是同一种失败，只是发生在没有东西比对的地方。
const DOC = 'CLAUDE.md';
const docText = fs.readFileSync(path.join(ROOT, DOC), 'utf8');
const section = docText.slice(docText.indexOf('### 6.1'), docText.indexOf('### 6.2'));
const docWords = new Set(section.split(/[^A-Za-z0-9_]+/));
for (const key of [...schema.keys()].sort()) {
  if (!docWords.has(key)) failures.push(`${DOC} §6.1 未记 schema 变量 ${key}`);
}

if (failures.length > 0) {
  console.error(`\n[env-example] ${failures.length} 处：\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    `\n补进对应模板（可注释掉、带一行说明）。\nAdd them to the template (commented is fine, with a one-line note).\n`,
  );
  process.exit(1);
}
console.log(
  `[env-example] ${schema.size} 个 schema 变量：都在 ${REFERENCE} 与 ${DOC} §6.1 里；${required.length} 个必填变量在全部 ${TEMPLATES.length} 份模板里 ✓`,
);
