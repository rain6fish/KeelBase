#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Application Model 门禁（CE-2 PC-7 · 机读化补强）：仓内**构建期模型**必须过其 JSON Schema。
 *   - `specs/*.json`（模块协议，keelbase init 输入）→ module-spec.schema.json
 *   - `.keelbase/manifest.json`（若存在）→ manifest.schema.json
 *   - `Server-NestJS/src/<module>/.keelbase-provenance.json`（若存在）→ module-provenance.schema.json
 *
 * 存在的意义：specs/ 下的 spec 此前只在生成时被 validate.mjs 逐行手查，**已提交的真实 spec
 * 本身无门禁**；manifest 只被 doctor 逐字段手查；模块生成证明**从不被任何检查读取**。
 * 零依赖（node:fs + node:path + scripts/generator/schema-validate.mjs）；CI: npm run check:app-model
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from './generator/schema-validate.mjs';

const ROOT = process.cwd();
const SCHEMAS = join(ROOT, 'scripts/generator/schemas');
const loadSchema = (name) => JSON.parse(readFileSync(join(SCHEMAS, name), 'utf8'));

const moduleSpecSchema = loadSchema('module-spec.schema.json');
const manifestSchema = loadSchema('manifest.schema.json');
const provenanceSchema = loadSchema('module-provenance.schema.json');

const failures = [];
let checked = 0;

function checkFile(label, file, schema) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    failures.push(`${label}: JSON 解析失败 — ${e.message}`);
    return;
  }
  checked++;
  for (const err of validate(schema, doc)) failures.push(`${label} ${err}`);
}

function listDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// ① 模块协议 specs/*.json（排除 OpenAPI 集成输入 —— 那是另一类制品）
const specsDir = join(ROOT, 'specs');
for (const f of listDir(specsDir).filter((n) => n.endsWith('.json') && !n.endsWith('.openapi.json')).sort()) {
  checkFile(`specs/${f}`, join(specsDir, f), moduleSpecSchema);
}

// ② 来源身份清单
const manifestFile = join(ROOT, '.keelbase/manifest.json');
if (existsSync(manifestFile)) checkFile('.keelbase/manifest.json', manifestFile, manifestSchema);

// ③ 模块生成证明（存在则校验；缺席不阻断 —— provenance 可移除，不影响代码与运行）
const srcDir = join(ROOT, 'Server-NestJS/src');
for (const m of listDir(srcDir).sort()) {
  const pf = join(srcDir, m, '.keelbase-provenance.json');
  if (existsSync(pf)) checkFile(`Server-NestJS/src/${m}/.keelbase-provenance.json`, pf, provenanceSchema);
}

if (failures.length > 0) {
  console.error(`✗ Application Model 门禁未通过（${failures.length} 项）：`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ Application Model 门禁通过：${checked} 份模型过 schema（module-spec / manifest / provenance）`);
