#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * A committed sample must still be what the generator produces from its spec.
 *
 * The drift this guards against is the quiet kind: a fix applied to the *generated artifact* rather than
 * to the *template*. The artifact looks right, tests pass, and the next regeneration silently drops the
 * fix — that is exactly how the runtime identity guard was lost from `reports` once (main `06f57665`
 * put it in the artifact, `8b894633` put it back into the template). Rendering every sample from its
 * spec and diffing the backend files turns that into a red gate instead of a manual comparison.
 *
 * 已检入的样例必须仍是生成器按其 spec 产出的那个样子。
 *
 * 本闸拦的是**安静的那一种漂移**：把修法加在**生成物**上，而不是**模板**上。生成物看着对、测试也过，
 * 而下一次重生成会**静默**把修法丢掉 —— 运行时身份守卫正是这样从 `reports` 丢过一次（主仓 `06f57665`
 * 加进生成物、`8b894633` 才补回模板）。把每个样例按其 spec 渲染一遍、与后端文件比对，就把这件事从
 * 「人工比对」变成一道会红的闸。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext } from './generator/validate.mjs';
import { backendFiles } from './generator/templates-backend.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Modules that are deliberately NOT pure generator output, so rendering them is not this check's job.
// Each entry says why — an unexplained exemption is how a real drift hides.
// 有意**不是**纯生成物的模块，渲染它们不是本闸的活儿。每条都写明**为什么** —— 无理由的豁免正是真漂移藏身之处。
const EXEMPT = new Map([
  ['events', '手写服务（不在 .keelbase/manifest.json）；specs/events.json 只是同名'],
  ['todos', '手写服务（不在 .keelbase/manifest.json）；specs/todos.json 只是同名'],
  ['posts', '生成后**手工扩展**（GROWTH-2 社交功能 + 三个实体）⇒ 重生成会毁掉它，见 roadmap'],
  ['followup_plans', '生成后**手工扩展**（`utcDay` / `utcWeekOf` 日期区间读取）⇒ 重生成会毁掉它，见 roadmap'],
]);

/** 生成物不带许可头（那是后处理加的），比对前两边都归一化掉；行尾也统一，免得 CRLF 制造假红。 */
const normalize = (s) =>
  s.replace(/^\/\/ SPDX-License-Identifier: Apache-2\.0\r?\n\r?\n/, '').replace(/\r\n/g, '\n');

const specDir = path.join(ROOT, 'specs');
const failures = [];
let checked = 0;

for (const entry of fs.readdirSync(specDir).sort()) {
  if (!entry.endsWith('.json')) continue;
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(path.join(specDir, entry), 'utf8'));
  } catch {
    continue; // 非协议 JSON（如 OpenAPI 抓取件）
  }
  if (!spec.module || !Array.isArray(spec.fields)) continue;
  const moduleDir = path.join(ROOT, 'Server-NestJS', 'src', spec.module);
  if (!fs.existsSync(moduleDir)) continue;
  if (EXEMPT.has(spec.module)) continue;

  const ctx = buildContext(spec.module, spec.label ?? spec.module, spec.fields);
  ctx.featureFlag = spec.featureFlag !== false;
  ctx.isTab = spec.tab === true;
  ctx.searchable = spec.searchable === true;
  ctx.scope = spec.scope ?? [];

  for (const out of backendFiles(ctx)) {
    const disk = path.join(ROOT, 'Server-NestJS', 'src', out.path);
    checked++;
    if (!fs.existsSync(disk)) {
      failures.push(`${out.path} — 生成器会写这个文件，仓里没有`);
      continue;
    }
    if (normalize(fs.readFileSync(disk, 'utf8')) !== normalize(out.content)) {
      failures.push(`${out.path} — 与生成器产出不一致（生成物被手工改过，或模板变了而样例没重生成）`);
    }
  }
}

if (failures.length > 0) {
  console.error(`\n[generated-samples] ${failures.length} 处漂移：\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    `\n要么样例该重新生成，要么修法该落在模板 / 生成器里（而不是只落在生成物上）。\n` +
      `Both are fixes: regenerate the sample, or move the change into the template.\n`,
  );
  process.exit(1);
}
console.log(`[generated-samples] ${checked} 个生成文件与各自 spec 一致 ✓`);
