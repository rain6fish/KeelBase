// SPDX-License-Identifier: Apache-2.0

/**
 * P0-9f decimal field tests (node:test, zero dependency).
 * Run: node --test scripts/decimal-field.test.mjs
 *
 * Includes a generic guard: every type in FIELD_TYPES must exist in every
 * template map. Adding a type to the closed set without adding it to all four
 * maps throws at generation time, and a spec-level gate would never catch it.
 *
 * P0-9f decimal 字段单测（node:test，零依赖）。
 * 运行：node --test scripts/decimal-field.test.mjs
 *
 * 含一条通用守卫：`FIELD_TYPES` 里的每个类型都必须在**每个模板映射**里存在。
 * 往闭集加类型却漏了某个映射，会在生成时直接抛错，而 spec 级门禁永远发现不了。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  FIELD_TYPES,
  buildContext,
  decimalScale,
  normalizeSpecFields,
  validateDecimalField,
  validateFields,
} from './generator/validate.mjs';
import {
  controllerSpecTemplate,
  controllerTemplate,
  createDtoTemplate,
  entityTemplate,
  moduleTemplate,
  serviceSpecTemplate,
  serviceTemplate,
  updateDtoTemplate,
} from './generator/templates-backend.mjs';
import { modelTemplate, pageTemplate, providerTemplate, repositoryTemplate } from './generator/templates-frontend.mjs';
import {
  taroPageTemplate,
  taroScssTemplate,
  taroServiceTemplate,
  taroStoreTemplate,
  taroTypesTemplate,
} from './generator/templates-taro.mjs';
import { adminApiTemplate, adminI18nKeys, adminViewTemplate } from './generator/templates-admin.mjs';
import { validate as validateAgainstSchema } from './generator/schema-validate.mjs';

const require = createRequire(import.meta.url);
const moduleSpecSchema = require('./generator/schemas/module-spec.schema.json');

const TEMPLATES = {
  backend: [
    entityTemplate,
    createDtoTemplate,
    updateDtoTemplate,
    serviceTemplate,
    controllerTemplate,
    moduleTemplate,
    controllerSpecTemplate,
    serviceSpecTemplate,
  ],
  frontend: [modelTemplate, repositoryTemplate, providerTemplate, pageTemplate],
  taro: [taroServiceTemplate, taroTypesTemplate, taroStoreTemplate, taroPageTemplate, taroScssTemplate],
  admin: [adminApiTemplate, adminViewTemplate, adminI18nKeys],
};

/** A ctx whose only interesting field is of the given type. */
function ctxForType(type) {
  const field = { name: 'amount', type };
  if (type === 'enum') field.enum = ['draft', 'issued'];
  if (type === 'decimal') {
    field.scale = 3;
    field.currency = true;
  }
  // ref 需要伴生键才能构成合法声明（target 与 display 皆必填）
  if (type === 'ref') {
    field.target = 'customers';
    field.display = 'name';
  }
  return buildContext('invoices', '发票', normalizeSpecFields([{ name: 'title', type: 'string' }, field]));
}

// ─── Generic guard: 4 definition points ──────────────────────────────────────

test('每个字段类型都必须在所有模板映射里存在（漏一个即生成时抛错）', () => {
  assert.ok(FIELD_TYPES.size >= 7, 'FIELD_TYPES 应含 7 种类型（含 decimal）');
  for (const type of FIELD_TYPES) {
    const ctx = ctxForType(type);
    for (const [group, fns] of Object.entries(TEMPLATES)) {
      for (const fn of fns) {
        assert.doesNotThrow(() => fn(ctx), `${group} 的 ${fn.name} 缺 ${type} 的映射`);
      }
    }
  }
});

// ─── decimal: emission ───────────────────────────────────────────────────────

test('decimal：实体列带 precision/scale，并带字符串归一转换器', () => {
  const src = entityTemplate(ctxForType('decimal'));
  assert.ok(src.includes("type: 'decimal', precision: 18, scale: 3"), '列须显式 decimal + precision/scale');
  assert.ok(src.includes('transformer: decimalStringTransformer'));
  assert.ok(src.includes('const decimalStringTransformer'), '转换器须内联在该实体内（自包含，不动 Core）');
  assert.ok(src.includes('amount?: string | null;'), '实体字段类型须是 string，不是 number');
});

test('decimal：DTO 以十进制字符串校验，并按 scale 限位', () => {
  const dto = createDtoTemplate(ctxForType('decimal'));
  assert.ok(dto.includes('@IsNumberString()'));
  assert.ok(dto.includes('\\d{1,3}'), 'scale=3 应体现在小数位上限');
  assert.ok(dto.includes('amount?: string;'));
  assert.ok(!dto.includes('@IsInt()'));
});

test('decimal：Flutter 模型用 String（不是 double）', () => {
  const model = modelTemplate(ctxForType('decimal'));
  assert.ok(model.includes('final String? amount;'));
  assert.ok(!model.includes('double'), '用 double 会把后端刻意避免的浮点舍入重新引入');
});

test('decimal：Taro 与管理台的 TS 类型均为 string', () => {
  const ctx = ctxForType('decimal');
  assert.ok(taroTypesTemplate(ctx).includes('amount: string'), 'Taro 侧应为 string');
  assert.ok(adminApiTemplate(ctx).includes('amount: string;'), '管理台 TS 应为 string');
});

test('无 decimal 字段时不产出转换器（不产死代码）', () => {
  const ctx = buildContext('invoices', '发票', normalizeSpecFields([{ name: 'title', type: 'string' }]));
  assert.ok(!entityTemplate(ctx).includes('decimalStringTransformer'));
});

// ─── decimal: validation ─────────────────────────────────────────────────────

test('scale / currency 只允许出现在 decimal 字段上', () => {
  assert.match(validateDecimalField({ name: 'x', type: 'int', scale: 2 }), /不是 decimal/);
  assert.match(validateDecimalField({ name: 'x', type: 'string', currency: true }), /不是 decimal/);
});

test('decimal：scale 须 0-6 整数、currency 须布尔', () => {
  assert.equal(validateDecimalField({ name: 'x', type: 'decimal' }), null);
  assert.equal(validateDecimalField({ name: 'x', type: 'decimal', scale: 6, currency: true }), null);
  assert.match(validateDecimalField({ name: 'x', type: 'decimal', scale: 7 }), /0-6/);
  assert.match(validateDecimalField({ name: 'x', type: 'decimal', scale: 1.5 }), /整数/);
  assert.match(validateDecimalField({ name: 'x', type: 'decimal', currency: 'yes' }), /布尔/);
});

test('validateFields 会带上 decimal 的非法项', () => {
  assert.match(validateFields([{ name: 'amount', type: 'decimal', scale: 9 }]), /0-6/);
  assert.equal(validateFields([{ name: 'amount', type: 'decimal', scale: 2 }]), null);
});

test('decimalScale：缺省 2', () => {
  assert.equal(decimalScale({ type: 'decimal' }), 2);
  assert.equal(decimalScale({ type: 'decimal', scale: 4 }), 4);
  assert.equal(decimalScale(undefined), 2);
});

test('normalizeSpecFields：scale / currency 不被静默剥掉', () => {
  const kept = normalizeSpecFields([{ name: 'amount', type: 'decimal', scale: 3, currency: true }]);
  assert.equal(kept[0].scale, 3);
  assert.equal(kept[0].currency, true);
  const none = normalizeSpecFields([{ name: 'amount', type: 'decimal' }]);
  assert.equal('scale' in none[0], false);
  assert.equal('currency' in none[0], false);
});

// ─── schema (shape only; placement is the validator's job) ───────────────────

test('schema：接受 decimal + scale/currency，且 scale 越界即拒', () => {
  const ok = {
    module: 'invoices',
    label: '发票',
    fields: [{ name: 'amount', type: 'decimal', scale: 2, currency: true }],
  };
  assert.deepEqual(validateAgainstSchema(moduleSpecSchema, ok), []);

  const tooBig = {
    module: 'invoices',
    label: '发票',
    fields: [{ name: 'amount', type: 'decimal', scale: 9 }],
  };
  assert.ok(validateAgainstSchema(moduleSpecSchema, tooBig).length > 0, 'scale 越界应由 schema 拦下');

  // 注意两层分工：schema 管「形状」（scale 是 0-6 的整数），
  // 「scale 只能出现在 decimal 上」这条**位置**规则由 validateDecimalField 管。
  const misplaced = {
    module: 'invoices',
    label: '发票',
    fields: [{ name: 'amount', type: 'int', scale: 2 }],
  };
  assert.deepEqual(validateAgainstSchema(moduleSpecSchema, misplaced), [], 'schema 不判位置');
  assert.match(validateDecimalField({ name: 'amount', type: 'int', scale: 2 }), /不是 decimal/);
});
