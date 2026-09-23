// SPDX-License-Identifier: Apache-2.0

/**
 * P0-9i `pii` declaration tests (node:test, zero dependency).
 * Run: node --test scripts/pii-field.test.mjs
 *
 * P0-9i `pii` 声明单测（node:test，零依赖）。
 * 运行：node --test scripts/pii-field.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  buildContext,
  normalizeSpecFields,
  piiFieldNames,
  validateFields,
  validatePiiField,
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

const ALL_TEMPLATES = [
  entityTemplate,
  createDtoTemplate,
  updateDtoTemplate,
  serviceTemplate,
  controllerTemplate,
  moduleTemplate,
  controllerSpecTemplate,
  serviceSpecTemplate,
  modelTemplate,
  repositoryTemplate,
  providerTemplate,
  pageTemplate,
  taroServiceTemplate,
  taroTypesTemplate,
  taroStoreTemplate,
  taroPageTemplate,
  taroScssTemplate,
  adminApiTemplate,
  adminViewTemplate,
  adminI18nKeys,
];

const PII_FIELDS = [
  { name: 'fullName', type: 'string', pii: true },
  { name: 'idCardNo', type: 'string', pii: true },
  { name: 'title', type: 'string' },
];

function ctxWith(fields) {
  return buildContext('members', '会员', normalizeSpecFields(fields));
}

// ─── Validator ───────────────────────────────────────────────────────────────

test('pii：只能声明在字符串型字段上（掩码产出字符串）', () => {
  for (const type of ['string', 'text', 'enum', 'decimal']) {
    const f = { name: 'x', type, pii: true };
    if (type === 'enum') f.enum = ['a1', 'b2'];
    assert.equal(validatePiiField(f), null, `${type} 应可声明 pii`);
  }
  for (const type of ['date', 'int', 'bool']) {
    assert.match(
      validatePiiField({ name: 'x', type, pii: true }),
      /掩码产出字符串/,
      `${type} 不应可声明 pii`,
    );
  }
});

test('pii：false 任意类型皆可（显式「非个人数据」）；非布尔被拒', () => {
  assert.equal(validatePiiField({ name: 'x', type: 'int', pii: false }), null);
  assert.equal(validatePiiField({ name: 'x', type: 'string' }), null);
  assert.match(validatePiiField({ name: 'x', type: 'string', pii: 'yes' }), /须为布尔/);
});

test('pii：经 validateFields 生效', () => {
  assert.match(validateFields([{ name: 'birthday', type: 'date', pii: true }]), /掩码产出字符串/);
  assert.equal(validateFields([{ name: 'fullName', type: 'string', pii: true }]), null);
});

test('piiFieldNames：按声明顺序返回，单源供三处使用', () => {
  assert.deepEqual(piiFieldNames(normalizeSpecFields(PII_FIELDS)), ['fullName', 'idCardNo']);
  assert.deepEqual(piiFieldNames(normalizeSpecFields([{ name: 'title', type: 'string' }])), []);
  assert.deepEqual(piiFieldNames(undefined), []);
});

test('normalizeSpecFields：pii 不被静默剥掉', () => {
  const kept = normalizeSpecFields([{ name: 'fullName', type: 'string', pii: true }]);
  assert.equal(kept[0].pii, true);
  const none = normalizeSpecFields([{ name: 'title', type: 'string' }]);
  assert.equal('pii' in none[0], false);
});

// ─── Generator ───────────────────────────────────────────────────────────────

test('后端：声明 pii → 管理端列表走服务端掩码', () => {
  const svc = serviceTemplate(ctxWith(PII_FIELDS));
  assert.ok(svc.includes("import { maskText } from '../common/utils/mask';"));
  assert.ok(svc.includes('private _maskPii(row: Member): Member'));
  assert.ok(svc.includes('return rows.map((row) => this._maskPii(row));'));
  assert.ok(svc.includes('fullName: row.fullName == null ? row.fullName : maskText(String(row.fullName)),'));
  assert.ok(svc.includes('idCardNo: row.idCardNo == null ? row.idCardNo : maskText(String(row.idCardNo)),'));
  assert.ok(!svc.includes('title: row.title'), '非 pii 字段不得被掩码');
});

test('后端：模块注册 pii 键名给审计（内建清单不认识这些名字）', () => {
  const mod = moduleTemplate(ctxWith(PII_FIELDS));
  assert.ok(mod.includes("import { registerSensitiveKeys } from '../common/utils/mask';"));
  assert.ok(mod.includes("registerSensitiveKeys(['fullName', 'idCardNo']);"));
});

test('后端：未声明 pii → 不产掩码路径、不注册（不产死代码）', () => {
  const ctx = ctxWith([{ name: 'title', type: 'string' }]);
  const svc = serviceTemplate(ctx);
  const mod = moduleTemplate(ctx);
  assert.ok(!svc.includes('maskText'), '无 pii 时不得引入 maskText');
  assert.ok(!svc.includes('_maskPii'));
  assert.ok(!mod.includes('registerSensitiveKeys'));
  assert.ok(svc.includes('async findAllForAdmin(): Promise<Member[]> {'));
});

test('带 pii 的 ctx 能跑遍所有模板（漏一个映射即抛错）', () => {
  const ctx = ctxWith(PII_FIELDS);
  for (const fn of ALL_TEMPLATES) {
    assert.doesNotThrow(() => fn(ctx), `${fn.name} 未处理带 pii 的 ctx`);
  }
});

// ─── Schema ──────────────────────────────────────────────────────────────────

test('schema：接受 pii（位置规则由 validatePiiField 管）', () => {
  const spec = {
    module: 'members',
    label: '会员',
    fields: [{ name: 'fullName', type: 'string', pii: true }],
  };
  assert.deepEqual(validateAgainstSchema(moduleSpecSchema, spec), []);

  // 两层分工：schema 管「pii 是布尔」，「只能声明在字符串型字段上」由 validatePiiField 管。
  const misplaced = {
    module: 'members',
    label: '会员',
    fields: [{ name: 'birthday', type: 'date', pii: true }],
  };
  assert.deepEqual(validateAgainstSchema(moduleSpecSchema, misplaced), [], 'schema 不判位置');
  assert.match(validatePiiField({ name: 'birthday', type: 'date', pii: true }), /掩码产出字符串/);
});
