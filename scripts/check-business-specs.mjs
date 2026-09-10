#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Business Spec 门禁：扫 `.keelbase/business-spec/*.json`，逐个跑映射器，坏 spec 不许入库。
 *
 * 为什么需要：`.keelbase/business-spec/` 下的 spec 是「业务规格 → 协议」的源，会被 `keelbase init` 消费。
 * 它们此前只被单测间接覆盖（单测用构造数据），**已提交的真实 spec 本身没有任何门禁**——
 * 改坏了（字段类型越界、enum 选项非法、evidenceRef 悬空）要到生成时才发现。
 *
 * 判定（对齐 docs/business-spec.md §4）：
 *   - error     → 失败（spec 不可映射）
 *   - warnings  → 失败（可生成的缺陷；已提交的 spec 不该带着它，典型是 evidenceRef 死链）
 *   - unmapped  → **不算失败**，是合法的范围边界（协议表达不了的走手写）
 *
 * 零依赖（node:fs + node:path），CI 接入：npm run spec:check
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mapBusinessSpec } from './generator/business-spec.mjs';

const SPEC_DIR = resolve(process.cwd(), '.keelbase/business-spec');
const failures = [];
let checked = 0;

let files = [];
try {
  files = readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json')).sort();
} catch {
  console.log(`· 跳过：${SPEC_DIR} 不存在（无已提交的 Business Spec）`);
  process.exit(0);
}

if (files.length === 0) {
  console.log(`· 跳过：${SPEC_DIR} 下没有 .json（无已提交的 Business Spec）`);
  process.exit(0);
}

console.log(`Business Spec 门禁：检查 ${files.length} 个 spec\n`);

for (const file of files) {
  const path = join(SPEC_DIR, file);
  let spec;
  try {
    spec = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    failures.push(`${file}：JSON 解析失败 —— ${e.message}`);
    console.log(`  ✗ ${file}：JSON 解析失败`);
    continue;
  }

  const r = mapBusinessSpec(spec);
  if (r.error) {
    failures.push(`${file}：${r.error}`);
    console.log(`  ✗ ${file}：${r.error}`);
    continue;
  }
  if (r.warnings.length > 0) {
    for (const w of r.warnings) failures.push(`${file}：${w}`);
    console.log(`  ✗ ${file}：${r.warnings.length} 条告警`);
    continue;
  }

  checked += 1;
  const tail = r.unmapped.length > 0 ? `（${r.unmapped.length} 项不可映射 → 手写，非失败）` : '';
  console.log(`  ✓ ${file} → ${r.protocol.module}（${r.protocol.fields.length} 字段）${tail}`);
}

console.log('');
if (failures.length > 0) {
  console.error(`✗ Business Spec 门禁未通过（${failures.length} 项）：`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ Business Spec 门禁通过（${checked}/${files.length}）`);
