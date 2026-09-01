// SPDX-License-Identifier: Apache-2.0

/**
 * P0-12 输入通道：OpenAPI / Swagger → Module Protocol。
 *
 * 从 OpenAPI 3（components.schemas）或 Swagger 2（definitions）提取一个 schema，
 * 映射为 Protocol 字段（string/text/int/bool/date/enum）供 keelbase init 生成模块。
 * 零依赖，纯函数便于单测。
 *
 * 映射规则：
 *   - object / array / $ref → 关系或复杂结构，按协议红线保持手写，跳过
 *   - string + format date/date-time → date
 *   - string + enum（2-10 个合法小写选项）→ enum
 *   - integer / number → int；boolean → bool
 *   - id / createdAt / updatedAt / deletedAt / userId → 跳过（基座自带）
 */

import { toPlural } from './validate.mjs';

/** 识别为基座保留字段（camelCase 形态，OpenAPI 属性通常已是 camelCase） */
const RESERVED = new Set(['id', 'userId', 'createdAt', 'updatedAt', 'deletedAt']);

/** schema 名 → snake_case：Customer → customer，OrderItem → order_item */
function toSnake(name) {
  return name
    .replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`)
    .replace(/^_/, '');
}

/** OpenAPI 属性名 → 合法字段名（kebab/空格 → 下划线）；非法则返回 null 跳过 */
function sanitizeFieldName(name) {
  const n = name.replace(/[-\s]/g, '_');
  return /^[a-z][a-zA-Z0-9_]{0,29}$/.test(n) ? n : null;
}

const VALID_OPTION = /^[a-z][a-z0-9_]{0,24}$/;

export function parseOpenApiSpec(spec, opts = {}) {
  if (!spec || typeof spec !== 'object') return { error: '无效的 OpenAPI JSON' };

  // OpenAPI 3 → components.schemas；Swagger 2 → definitions
  const schemas = (spec.components?.schemas ?? spec.definitions ?? {});
  const names = Object.keys(schemas).filter((n) => {
    const s = schemas[n];
    return s && typeof s === 'object' && !s.$ref;
  });
  if (names.length === 0) return { error: '未找到可用的 schemas/definitions（需 components.schemas 或 definitions）' };

  const pick = opts.schema && names.includes(opts.schema) ? opts.schema : names[0];
  const schema = schemas[pick];
  const { fields, skipped, notes } = schemaFields(schema);
  if (fields.length === 0) {
    return { error: `schema「${pick}」没有可转换的标量属性（object/array/关系字段保持手写，不自动生成）` };
  }

  const module = opts.module ?? toPlural(toSnake(pick));
  const label = opts.label ?? pick;
  return { module, label, fields, skipped, notes, available: names };
}

/**
 * 提取字段 + 诊断报告（skipped: [{ name, reason }]）。
 * skip = 未转换（保留/关系/非法名）；downgrade 也记入（enum 非法降级 string）。
 */
function schemaFields(schema) {
  // #4 顶层 allOf 组合（如 Base + 扩展）：合并标量 properties + required（关系 $ref 保持手写）
  if (Array.isArray(schema.allOf)) {
    const merged = { ...schema };
    delete merged.allOf;
    for (const part of schema.allOf) {
      if (part && typeof part === 'object' && !part.$ref) {
        if (part.properties) Object.assign(merged.properties ?? (merged.properties = {}), part.properties);
        if (Array.isArray(part.required)) {
          merged.required = [...(merged.required ?? []), ...part.required];
        }
      }
    }
    schema = merged;
  }
  const props = schema.properties ?? {};
  const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);
  const fields = [];
  const skipped = [];
  const notes = [];
  for (const [rawName, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== 'object') {
      skipped.push({ name: rawName, reason: '属性定义缺失' });
      continue;
    }
    const name = sanitizeFieldName(rawName);
    if (!name) {
      skipped.push({ name: rawName, reason: '字段名非法（仅小写字母开头）' });
      continue;
    }
    if (RESERVED.has(name)) {
      skipped.push({ name, reason: '保留字段（基座自带，不生成）' });
      continue;
    }

    // #4 $ref / allOf：单层 $ref → 关系标注落入手写清单；纯标量 allOf → 合并；allOf 含 $ref → 关系跳过
    if (typeof prop.$ref === 'string') {
      skipped.push({ name, reason: `关系 $ref: ${prop.$ref}（协议红线保持手写）` });
      continue;
    }
    if (Array.isArray(prop.allOf)) {
      const refs = prop.allOf.filter((p) => p && typeof p === 'object' && p.$ref);
      if (refs.length > 0) {
        skipped.push({ name, reason: `allOf 含关系 $ref: ${refs.map((r) => r.$ref).join(',')}（协议红线保持手写）` });
        continue;
      }
      const merged = { ...prop };
      delete merged.allOf;
      for (const part of prop.allOf) {
        if (part && typeof part === 'object') {
          if (part.type) merged.type = part.type;
          if (part.properties) Object.assign(merged.properties ?? (merged.properties = {}), part.properties);
        }
      }
      prop = merged;
    }

    const type = mapType(prop);
    if (!type) {
      skipped.push({ name, reason: '关系/复杂结构（object/array/$ref，协议红线保持手写）' });
      continue;
    }

    // #8 number 精度提示：number / double / float → int 丢精度，金额字段谨慎
    if (type === 'int' && (prop.type === 'number' || prop.format === 'double' || prop.format === 'float')) {
      notes.push(`${name}：number/double → int 丢精度（价格/金额字段建议保留 text/int 或手写）`);
    }

    const field = { name, type };
    if (type === 'enum') {
      const options = (prop.enum ?? [])
        .filter((o) => typeof o === 'string' && VALID_OPTION.test(o));
      if (options.length >= 2 && options.length <= 10) {
        field.enum = options;
      } else {
        // 选项不合法/超限 → 降级为 string，并记录诊断
        field.type = 'string';
        skipped.push({ name, reason: 'enum 选项非法/超限 → 降级为 string' });
      }
    }
    const label = sanitizeLabel(prop.title ?? prop.description);
    if (label) field.label = label;
    if (requiredSet.has(name)) field.required = true;
    fields.push(field);
  }
  return { fields, skipped, notes };
}

/** OpenAPI title/description → 安全 label（去除会破坏生成代码的引号/反斜杠/换行，限长）。 */
function sanitizeLabel(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/['\\\n\r]/g, '').trim();
  if (!s) return null;
  return s.length > 40 ? s.slice(0, 40) : s;
}

/** 属性 → Protocol 类型；object/array/$ref 返回 null（不转换） */
function mapType(prop) {
  if (Array.isArray(prop.enum) && prop.enum.length >= 2) return 'enum';
  switch (prop.type) {
    case 'string':
      return prop.format === 'date' || prop.format === 'date-time' ? 'date' : 'string';
    case 'integer':
    case 'number':
      return 'int';
    case 'boolean':
      return 'bool';
    default:
      return null;
  }
}
