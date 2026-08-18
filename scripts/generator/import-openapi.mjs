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
  const fields = schemaFields(schema);
  if (fields.length === 0) {
    return { error: `schema「${pick}」没有可转换的标量属性（object/array/关系字段保持手写，不自动生成）` };
  }

  const module = opts.module ?? toPlural(toSnake(pick));
  const label = opts.label ?? pick;
  return { module, label, fields };
}

function schemaFields(schema) {
  const props = schema.properties ?? {};
  const fields = [];
  for (const [rawName, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== 'object') continue;
    const name = sanitizeFieldName(rawName);
    if (!name || RESERVED.has(name)) continue;

    const type = mapType(prop);
    if (!type) continue; // object/array/$ref → 关系，保持手写

    if (type === 'enum') {
      const options = (prop.enum ?? [])
        .filter((o) => typeof o === 'string' && VALID_OPTION.test(o));
      if (options.length >= 2 && options.length <= 10) {
        fields.push({ name, type: 'enum', enum: options });
        continue;
      }
      // 选项不合法/超限 → 降级为 string
      fields.push({ name, type: 'string' });
    } else {
      fields.push({ name, type });
    }
  }
  return fields;
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
