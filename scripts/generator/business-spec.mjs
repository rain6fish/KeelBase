// SPDX-License-Identifier: Apache-2.0

/**
 * Consulting → Build 输入通道：Business Spec → Module Protocol。
 *
 * 业务访谈产出的 Business Spec（构建期上游输入模型）由本模块**确定性**编译为
 * 现有薄协议（docs/module-protocol.md），再交给 keelbase init --spec 生成源码。
 * 零依赖、零网络、纯函数（便于单测与 CI diff 门禁）。
 *
 * 边界（fail-closed）：
 *   - 薄协议一次只映射一个业务对象；多对象进 unmapped（拆分 Business Spec）
 *   - 字段类型仅 string/text/int/bool/date/enum；超范围类型不静默丢弃，进 unmapped
 *   - 关联字段（relation）按 int 列生成，关系查询手写，进 unmapped
 *   - 多角色权限、业务规则、非 read/write 的 AI 能力 → 进 unmapped，走 AGENTS.md §3 手写
 *   - decisions/acceptance/outOfScope 属交付溯源，进 notes，不进协议
 *
 * unmapped 非空不代表失败——它代表本次生成的范围边界（见 docs/business-spec.md §4）。
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  FIELD_TYPES,
  validateModuleName,
  validateLabel,
  validateFields,
  validateAiTools,
  normalizeSpecFields,
  toPlural,
} from './validate.mjs';

const AI_KINDS = new Set(['read', 'write']);

/** 结构校验：只查 Business Spec 是否成形（字段合法性与映射边界由 mapBusinessSpec 处理）。 */
export function validateBusinessSpec(spec) {
  if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) {
    return 'Business Spec 必须是对象';
  }
  if (typeof spec.feature !== 'string' || !spec.feature.trim()) return 'feature 不能为空';
  if (typeof spec.goal !== 'string' || !spec.goal.trim()) return 'goal 不能为空';
  if (!Array.isArray(spec.actors) || spec.actors.length === 0) return 'actors 必须是非空数组';
  if (!Array.isArray(spec.objects) || spec.objects.length === 0) return 'objects 必须是非空数组';

  const primary = spec.objects[0];
  if (primary == null || typeof primary !== 'object' || Array.isArray(primary)) {
    return 'objects[0] 必须是对象';
  }
  if (typeof primary.name !== 'string' || !primary.name.trim()) return 'objects[0].name 不能为空';
  if (!Array.isArray(primary.fields)) return 'objects[0].fields 必须是数组';
  return null;
}

/**
 * Business Spec → Module Protocol。
 * 三类回报，语义不同（CI 门禁只认前两类）：
 *   - error       硬失败，不产出协议
 *   - warnings    可生成的缺陷（如 evidenceRef 悬空）——生成不阻断，但**已提交的 spec 不该带着它**
 *   - unmapped    协议表达不了的，需手写补全（合法的范围边界，非缺陷）
 *   - notes       纯信息（哪些字段留在 Business Spec / Evidence）
 * @returns {{ error: string } | { protocol: object, unmapped: Array, notes: Array, warnings: Array }}
 */
export function mapBusinessSpec(spec) {
  const invalid = validateBusinessSpec(spec);
  if (invalid) return { error: invalid };

  const primary = spec.objects[0];
  const module = primary.module ?? toPlural(primary.name);
  const moduleError = validateModuleName(module);
  if (moduleError) return { error: moduleError };

  const label = primary.label ?? primary.name;
  const labelError = validateLabel(label);
  if (labelError) return { error: `对象「${primary.name}」的 label 非法：${labelError}` };

  const unmapped = [];
  const notes = [];
  const warnings = [];

  // 多对象：薄协议一次一个模块
  for (const extra of spec.objects.slice(1)) {
    unmapped.push({
      name: extra?.name ?? '(未命名对象)',
      reason: '薄协议一次只映射一个业务对象',
      action: '拆分为独立 Business Spec 后分别生成',
    });
  }

  // 权限：协议固定「本人数据」所有权，无角色模型
  if (spec.actors.length > 1) {
    unmapped.push({
      name: `actors: ${spec.actors.join(', ')}`,
      reason: '多角色权限模型超出薄协议（协议固定本人所有权）',
      action: 'CASL 行级策略按 AGENTS.md §3 手写',
    });
  } else {
    notes.push(`单一角色「${spec.actors[0]}」按本人所有权生成；若该角色非数据所有者，需手写 CASL 策略`);
  }

  // 业务规则：不进薄协议
  for (const rule of spec.rules ?? []) {
    unmapped.push({
      name: typeof rule === 'string' ? rule : JSON.stringify(rule),
      reason: '业务规则不进薄协议',
      action: '服务层手写 + 单测覆盖',
    });
  }

  // 字段：超范围类型与关联字段不进协议主体
  const emitted = [];
  for (const f of primary.fields) {
    if (f == null || typeof f !== 'object') {
      unmapped.push({ name: '(非法字段)', reason: '字段必须是对象', action: '修正 Business Spec' });
      continue;
    }
    if (f.relation) {
      emitted.push({ name: f.name, type: 'int', ...(f.required === true ? { required: true } : {}) });
      unmapped.push({
        name: String(f.name),
        reason: '关联字段（外键）按 int 列生成',
        action: '关系查询/级联按 AGENTS.md §3 手写',
      });
      continue;
    }
    const type = f.type ?? 'string';
    if (!FIELD_TYPES.has(type)) {
      unmapped.push({
        name: String(f.name),
        reason: `字段类型 ${type} 超出协议词汇表（string/text/int/bool/date/enum）`,
        action: '该字段按 AGENTS.md §3 手写',
      });
      continue;
    }
    emitted.push(f);
  }

  const fields = normalizeSpecFields(emitted);
  if (fields.length === 0) {
    return { error: `对象「${primary.name}」没有可映射的标量字段` };
  }
  const fieldsError = validateFields(fields);
  if (fieldsError) return { error: fieldsError };

  // AI 能力 → aiTools（缺省透传给生成器默认：query R1 + create R3 需确认）
  const aiTools = mapAiCapabilities(spec.aiCapabilities, primary.name, unmapped);
  if (aiTools) {
    const aiError = validateAiTools(aiTools);
    if (aiError) return { error: aiError };
  }

  // 交付溯源：保留在 Business Spec / Evidence，不进协议
  for (const key of ['decisions', 'acceptance', 'outOfScope']) {
    const items = spec[key];
    if (Array.isArray(items) && items.length > 0) {
      notes.push(`${key}（${items.length} 项）保留在 Business Spec / Evidence，不进协议`);
    }
  }

  // 溯源链完整性：evidenceRef 指向的访谈 Evidence 必须真实存在，否则「这条规则来自哪次访谈」是死链
  if (typeof spec.evidenceRef === 'string' && spec.evidenceRef.trim()) {
    const ref = spec.evidenceRef.trim();
    if (!existsSync(resolve(process.cwd(), ref))) {
      warnings.push(`evidenceRef 指向的文件不存在（相对仓库根）：${ref} —— 交付溯源链在此断开`);
    }
  }

  const protocol = {
    module,
    plural: toPlural(module),
    label,
    ...(typeof primary.searchable === 'boolean' ? { searchable: primary.searchable } : {}),
    fields,
    ...(aiTools ? { aiTools } : {}),
  };

  return { protocol, unmapped, notes, warnings };
}

/** aiCapabilities → aiTools；返回 undefined 表示不声明（走生成器默认）。 */
function mapAiCapabilities(capabilities, objectName, unmapped) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) return undefined;

  const aiTools = {};
  let declared = false;
  for (const cap of capabilities) {
    if (cap == null || typeof cap !== 'object') continue;
    if (cap.object && cap.object !== objectName) continue;
    if (!AI_KINDS.has(cap.kind)) {
      unmapped.push({
        name: `${cap.kind ?? '(未指定)'}@${cap.object ?? objectName}`,
        reason: `AI 能力类型 "${cap.kind}" 不自动化（协议只自动化 query/create）`,
        action: '按 src/ai/tools/ 手写注册 + 治理',
      });
      continue;
    }
    const opts = {};
    if (cap.riskLevel !== undefined) opts.riskLevel = cap.riskLevel;
    if (cap.requiresConfirmation !== undefined) opts.requiresConfirmation = cap.requiresConfirmation;
    aiTools[cap.kind === 'read' ? 'query' : 'create'] = Object.keys(opts).length > 0 ? opts : true;
    declared = true;
  }
  return declared ? aiTools : undefined;
}

/* ═══════════════ CLI ═══════════════ */

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--in') args.in = argv[++i];
    else if (a === '--out') args.out = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in) {
    console.error('用法：node scripts/generator/business-spec.mjs --in <business-spec.json> [--out <module.json>] [--check]');
    process.exit(1);
  }

  let spec;
  try {
    spec = JSON.parse(readFileSync(args.in, 'utf8'));
  } catch (e) {
    console.error(`读取失败：${args.in} — ${e.message}`);
    process.exit(1);
  }

  const result = mapBusinessSpec(spec);
  if (result.error) {
    console.error(`✗ ${result.error}`);
    process.exit(1);
  }

  const { protocol, unmapped, notes, warnings } = result;
  console.log(`✓ ${spec.feature} → 模块协议「${protocol.module}」(${protocol.fields.length} 字段)`);
  for (const n of notes) console.log(`  · ${n}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  if (unmapped.length > 0) {
    console.log(`  ⚠ ${unmapped.length} 项不可映射（需手写补全）：`);
    for (const u of unmapped) console.log(`    - ${u.name}：${u.reason} → ${u.action}`);
  }

  if (args.check) return;
  if (args.out) {
    writeFileSync(args.out, `${JSON.stringify(protocol, null, 2)}\n`);
    console.log(`  → 已写入 ${args.out}`);
  } else {
    console.log(JSON.stringify(protocol, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
