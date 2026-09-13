// SPDX-License-Identifier: Apache-2.0

/**
 * 零依赖 JSON Schema（draft-07 子集）校验器（CE-2 PC-7：Application Model 机读化）。
 *
 * 只支持本仓 Application Model schema 实际用到的关键字——**不引 ajv**（根 CLI 与
 * `scripts/check-*.mjs` 保持零依赖，与 generator/门禁同一约定）：
 *   type / required / properties / additionalProperties / items / enum / const /
 *   pattern / minLength / maxLength / minItems / maxItems / minimum / maximum
 * 不支持 `$ref` / `oneOf` / `anyOf` / `allOf` / `format`——**需要时再扩**，
 * 不做「半个 JSON Schema 实现」假装完整（Code Economy §15.4 禁投机抽象）。
 */

/**
 * 校验并返回错误消息列表（空数组 = 通过）。
 * path 为 JSON 指针风格（如 `/fields/0/type`），便于定位。
 */
export function validate(schema, value, path = '') {
  const errs = [];
  check(schema, value, path, errs);
  return errs;
}

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function matchesType(expect, v) {
  const actual = typeOf(v);
  if (expect === 'number') return actual === 'number' || actual === 'integer';
  return actual === expect;
}

function check(schema, value, path, errs) {
  if (schema == null || typeof schema !== 'object') return;
  const where = path || '(root)';

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(t, value))) {
      errs.push(`${where}: 类型应为 ${types.join('|')}，实为 ${typeOf(value)}`);
      return; // 类型不符即返回，避免下游噪音
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errs.push(`${where}: 应恒为 ${JSON.stringify(schema.const)}，实为 ${JSON.stringify(value)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === value)) {
    errs.push(
      `${where}: 取值应为 ${schema.enum.map((e) => JSON.stringify(e)).join(' | ')}，实为 ${JSON.stringify(value)}`,
    );
  }
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errs.push(`${where}: 不匹配 pattern /${schema.pattern}/`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errs.push(`${where}: 长度应 ≥ ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errs.push(`${where}: 长度应 ≤ ${schema.maxLength}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${where}: 应 ≥ ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${where}: 应 ≤ ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errs.push(`${where}: 元素数应 ≥ ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errs.push(`${where}: 元素数应 ≤ ${schema.maxItems}`);
    }
    if (schema.items) value.forEach((v, i) => check(schema.items, v, `${path}/${i}`, errs));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const req of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, req)) errs.push(`${where}: 缺必需字段 ${req}`);
    }
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) {
        check(props[k], v, `${path}/${k}`, errs);
      } else if (schema.additionalProperties === false) {
        errs.push(`${where}: 不允许的字段 ${k}`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        check(schema.additionalProperties, v, `${path}/${k}`, errs);
      }
    }
  }
}
