#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Every environment variable the app reads through its config schema must be in `.env.example`.
 *
 * `.env.example` is the copy-paste starting point (`cp .env.example .env`); a variable that exists only
 * in the Joi schema is one a new deploy never learns about. Nothing read the two together, so they drift:
 * on 2026-10-11, 35 schema variables — `LOG_LEVEL`, the `OTEL_*` / `LOKI_*` pair, `PUSH_DRIVER`, the
 * `THROTTLE_*` pair, the per-module `FEATURE_*` flags and others — were absent from the template.
 *
 * One direction only. The reverse is not a defect: `.env.example` documents variables the schema does
 * not carry because they are read straight from `process.env` (`PROXY_FETCH_TIMEOUT_MS`, `SM2_*`,
 * `TRUST_PROXY`), and flagging those would be a false positive.
 *
 * 应用经配置 schema 读取的每个环境变量，都必须在 `.env.example` 里。
 *
 * `.env.example` 是「拷一份就能起」的起点（`cp .env.example .env`）；只活在 Joi schema 里的变量，新部署永远
 * 不会知道它存在。没有东西把两者放在一起读，于是它们会漂：2026-10-11 实测有 **35 个** schema 变量 ——
 * `LOG_LEVEL`、`OTEL_*` / `LOKI_*`、`PUSH_DRIVER`、`THROTTLE_*`、各模块 `FEATURE_*` 等 —— 不在模板里。
 *
 * **只查一个方向**。反方向不是缺陷：`.env.example` 会记一些 schema 不载的变量，因为它们直接从 `process.env`
 * 读（`PROXY_FETCH_TIMEOUT_MS`、`SM2_*`、`TRUST_PROXY`），把它们报出来是假阳性。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'Server-NestJS/src/config/env.config.ts';
const EXAMPLE = 'Server-NestJS/.env.example';

/** Keys the Joi schema declares — a line like `  FOO: Joi.string()...`.  Joi schema 声明的键。 */
const schemaKeys = new Set(
  [...fs.readFileSync(path.join(ROOT, SCHEMA), 'utf8').matchAll(/^\s+([A-Z][A-Z0-9_]+):\s*Joi\./gm)].map((m) => m[1]),
);

/** Keys the template mentions, commented or not — a line like `# FOO=…` or `FOO=…`.  模板里出现（含注释）的键。 */
const exampleKeys = new Set(
  [...fs.readFileSync(path.join(ROOT, EXAMPLE), 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]{2,})=/gm)].map((m) => m[1]),
);

const missing = [...schemaKeys].filter((k) => !exampleKeys.has(k)).sort();

if (missing.length > 0) {
  console.error(`\n[env-example] ${missing.length} 个 schema 变量不在 ${EXAMPLE} 里：\n`);
  for (const k of missing) console.error(`  ✗ ${k}`);
  console.error(
    `\n把缺的补进模板（可注释掉、带一行说明）。\n` +
      `Add the missing ones to the template (commented is fine, with a one-line note).\n`,
  );
  process.exit(1);
}
console.log(`[env-example] ${schemaKeys.size} 个 schema 变量都在 ${EXAMPLE} 里 ✓`);
