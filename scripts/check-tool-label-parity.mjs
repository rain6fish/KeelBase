#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0

/**
 * Tool-label parity gate.
 *
 * The backend emits an i18n key per tool (`ai.tool.<camelCase(toolName)>`, derived in
 * `tool-metadata.ts`). The console resolves that key against its own dictionary. The two drifted
 * before: the dictionary carried labels for four tools that do not exist while twelve real tools had
 * no entry at all. This gate compares the derived keys against the dictionaries.
 *
 * One-way on purpose. Every key the backend can emit must be present in both locales — but an extra
 * dictionary key is allowed, because tool names also arrive from systems this repo does not register
 * (the B-path proxy and its Java-side reference tools), and labelling those is correct.
 *
 * 工具标签对账门。
 *
 * 后端每个工具发一个 i18n key（`ai.tool.<camelCase(工具名)>`，在 `tool-metadata.ts` 里派生），
 * 管理台拿它去自己的字典里取。两边此前漂移过：字典里有四个**不存在**的工具的标签，而有 12 个真
 * 工具一条都没有。这道闸拿派生的 key 去对字典。
 *
 * **刻意单向**：后端**可能**发出来的 key，两个语言必须都有 —— 但字典多出来的 key 允许存在，因为
 * 工具名也会来自本仓不注册的系统（B 路径代理及其 Java 侧参考工具），给它们配标签是对的。
 *
 * 零依赖（node:fs）。CI：node scripts/check-tool-label-parity.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** `create_followup_task` → `ai.tool.createFollowupTask`（与后端 `toolLabelKey` 同一规则）。 */
const labelKey = (toolName) => `ai.tool.${toolName.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;

// 唯一的真源：元数据表的键
const metadataSrc = read('Server-NestJS/src/ai/audit/tool-metadata.ts');
const table = metadataSrc.slice(metadataSrc.indexOf('export const TOOL_METADATA'));
const toolNames = [...table.matchAll(/^ {2}([a-z][a-z0-9_]*): \{/gm)].map((m) => m[1]);
const expected = new Set(toolNames.map(labelKey));

// 消费方：管理台两个语言字典
const dictKeys = (rel) => {
  const src = read(rel);
  return [...src.matchAll(/'ai\.tool\.([A-Za-z0-9_]+)':/g)].map((m) => `ai.tool.${m[1]}`);
};
const LOCALES = {
  zh: dictKeys('Web-Admin-Vue/src/i18n/zh.ts'),
  en: dictKeys('Web-Admin-Vue/src/i18n/en.ts'),
};

const errors = [];

if (toolNames.length === 0) {
  errors.push('解析出的工具名为 0 —— 抽取规则已与 tool-metadata.ts 的形状脱节（闸本身失效）');
}

for (const [locale, keys] of Object.entries(LOCALES)) {
  const have = new Set(keys);
  const missing = [...expected].filter((k) => !have.has(k));
  if (missing.length) {
    errors.push(`${locale} 字典缺 ${missing.length} 个标签：${missing.join(', ')}`);
  }
}

// 两个语言必须同键集（一个语言多一条 = 另一语言显示回退文案）
const [zh, en] = [new Set(LOCALES.zh), new Set(LOCALES.en)];
const onlyZh = [...zh].filter((k) => !en.has(k));
const onlyEn = [...en].filter((k) => !zh.has(k));
if (onlyZh.length) errors.push(`只有 zh 有：${onlyZh.join(', ')}`);
if (onlyEn.length) errors.push(`只有 en 有：${onlyEn.join(', ')}`);

if (errors.length) {
  console.error('✗ 工具标签对账未通过：\n');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\n  （后端元数据是唯一真源：Server-NestJS/src/ai/audit/tool-metadata.ts）');
  process.exit(1);
}

console.log(
  `✓ 工具标签对账通过：元数据 ${toolNames.length} 个工具 → zh ${LOCALES.zh.length} / en ${LOCALES.en.length} 条，无缺项`,
);
