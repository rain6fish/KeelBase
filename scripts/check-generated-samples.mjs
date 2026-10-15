#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * A committed sample must still be what the generator produces from its spec.
 *
 * The drift this guards against is the quiet kind: a fix applied to the *generated artifact* rather than
 * to the *template*. The artifact looks right, tests pass, and the next regeneration silently drops the
 * fix — that is exactly how the runtime identity guard was lost from `reports` once (main `06f57665`
 * put it in the artifact, `8b894633` put it back into the template). Rendering every sample from its
 * spec and diffing the output turns that into a red gate instead of a manual comparison.
 *
 * All four groups are checked, not just the backend: the same failure has no reason to stay there.
 *
 * 已检入的样例必须仍是生成器按其 spec 产出的那个样子。
 *
 * 本闸拦的是**安静的那一种漂移**：把修法加在**生成物**上，而不是**模板**上。生成物看着对、测试也过，
 * 而下一次重生成会**静默**把修法丢掉 —— 运行时身份守卫正是这样从 `reports` 丢过一次（主仓 `06f57665`
 * 加进生成物、`8b894633` 才补回模板）。把每个样例按其 spec 渲染一遍、与生成物比对，就把这件事从
 * 「人工比对」变成一道会红的闸。
 *
 * 四组都查，不只是后端：同一种失败没有理由只在后端发生。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext } from './generator/validate.mjs';
import { backendFiles } from './generator/templates-backend.mjs';
import { frontendFiles } from './generator/templates-frontend.mjs';
import { adminFiles } from './generator/templates-admin.mjs';
import { taroFiles } from './generator/templates-taro.mjs';
import { aiFiles } from './generator/templates-ai.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every group a module is generated into — { repo-relative dir, template }.
// 生成物落进的每一组 —— { 仓内相对目录, 模板 }。
const GROUPS = [
  ['Server-NestJS/src/', backendFiles],
  ['Server-NestJS/src/', aiFiles],
  ['Front-Flutter/lib/', frontendFiles],
  ['Web-Admin-Vue/', adminFiles],
  ['Front-Taro/', taroFiles],
];

// Modules that are deliberately NOT pure generator output, so rendering them is not this check's job.
// Each entry says why — an unexplained exemption is exactly where a real drift hides.
// 有意**不是**纯生成物的模块，渲染它们不是本闸的活儿。每条都写明**为什么** —— 无理由的豁免正是真漂移藏身之处。
const EXEMPT = new Map([
  ['events', '手写服务（不在 .keelbase/manifest.json）；specs/events.json 只是同名'],
  ['todos', '手写服务（不在 .keelbase/manifest.json）；specs/todos.json 只是同名'],
  ['posts', '生成后**手工扩展**（GROWTH-2 社交功能 + 三个实体）⇒ 重生成会毁掉它，见 roadmap'],
  ['followup_plans', '生成后**手工扩展**（`utcDay` / `utcWeekOf` 日期区间读取）⇒ 重生成会毁掉它，见 roadmap'],
  ['asset_loans', '生成后**手工扩展**（Rule 1 同一资产编号未归还期间不得再登记 · Rule 2 计划归还日须在未来 30 天内 —— Business Spec 的 `unmapped[]` 项）⇒ 重生成会毁掉它，见 docs/manual/delivery-recipe.md'],
]);

/**
 * 生成物不带许可头（那是后处理加的），比对前先摘掉；行尾也统一，免得 CRLF 制造假红。
 * The committed file carries a license header the generator does not emit; drop it (and the blank line
 * after it) before comparing, and normalize line endings so CRLF cannot fake a mismatch.
 */
const normalize = (s) => {
  const lines = s.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] && /SPDX-License-Identifier/.test(lines[0])) {
    lines.shift();
    if (lines[0] === '') lines.shift();
  }
  return lines.join('\n');
};

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

  // 目录名要**按生成器的口径**解析，不能假设 `spec.module` 就是目录名：生成器把目录命名为
  // `buildContext(name).plural`（`user_profile` → `user_profiles`），而 `--module <单数>` 正是帮助里
  // 写着的用法。此前这里直接找 `src/<spec.module>`，于是「名字不是它自己的复数」的那份协议
  // **匹配不到目录、被静默跳过** —— 门绿着，但它没看这件东西（复制模块实测：第一版 spec 写成单数，
  // 样本门仍是 161，新模块对它不可见）。解析口径与生成器同源，这类漏看就不再可能。
  const ctx = buildContext(spec.module, spec.label ?? spec.module, spec.fields);
  if (!fs.existsSync(path.join(ROOT, 'Server-NestJS', 'src', ctx.plural))) continue;
  if (EXEMPT.has(ctx.plural)) continue;

  ctx.featureFlag = spec.featureFlag !== false;
  ctx.isTab = spec.tab === true;
  ctx.searchable = spec.searchable === true;
  ctx.scope = spec.scope ?? [];

  for (const [base, files] of GROUPS) {
    for (const out of files(ctx)) {
      const rel = `${base}${out.path}`;
      const disk = path.join(ROOT, rel);
      checked++;
      if (!fs.existsSync(disk)) {
        failures.push(`${rel} — 生成器会写这个文件，仓里没有`);
        continue;
      }
      if (normalize(fs.readFileSync(disk, 'utf8')) !== normalize(out.content)) {
        failures.push(`${rel} — 与生成器产出不一致（生成物被手工改过，或模板变了而样例没重生成）`);
      }
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
