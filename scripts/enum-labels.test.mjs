// SPDX-License-Identifier: Apache-2.0

/**
 * P0-9g enum label tests (node:test, zero dependency).
 * Run: node --test scripts/enum-labels.test.mjs
 *
 * P0-9g 枚举标签单测（node:test，零依赖）。
 * 运行：node --test scripts/enum-labels.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildContext,
  enumLabelGetter,
  hasEnumLabels,
  normalizeSpecFields,
  validateEnumLabels,
} from './generator/validate.mjs';
import { pageTemplate } from './generator/templates-frontend.mjs';
import { adminI18nKeys, adminViewTemplate } from './generator/templates-admin.mjs';
import { taroPageTemplate } from './generator/templates-taro.mjs';
import { enumLabelGetterDecls } from './generator/wire.mjs';
import { validate as validateAgainstSchema } from './generator/schema-validate.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const moduleSpecSchema = require('./generator/schemas/module-spec.schema.json');

const STATUS_LABELS = {
  lead: { zh: '线索', en: 'Lead' },
  active: { zh: '活跃', en: 'Active' },
};

const ENUM_FIELD = { name: 'status', type: 'enum', enum: ['lead', 'active'] };

function ctxWith(fields) {
  return buildContext('customers', '客户', normalizeSpecFields(fields));
}

/** Enum field carries labels. / enum 字段带标签。 */
const labelled = () => ctxWith([{ name: 'name', type: 'string' }, { ...ENUM_FIELD, enumLabels: STATUS_LABELS }]);
/** Enum field declares no labels at all. / enum 字段完全未声明标签。 */
const unlabelled = () => ctxWith([{ name: 'name', type: 'string' }, { ...ENUM_FIELD }]);
/** Enum field is first — the only field Taro renders. / enum 字段在首位 —— Taro 唯一渲染的那个。 */
const labelledFirst = () =>
  ctxWith([{ ...ENUM_FIELD, enumLabels: STATUS_LABELS }, { name: 'name', type: 'string' }]);

// ─── Validator ───────────────────────────────────────────────────────────────

test('enumLabels：未声明合法（回落标识符）', () => {
  assert.equal(validateEnumLabels('status', ['lead'], undefined), null);
  assert.equal(hasEnumLabels({ ...ENUM_FIELD }), false);
});

test('enumLabels：键须 ⊆ enum 选项', () => {
  const err = validateEnumLabels('status', ['lead', 'active'], { bogus: { zh: '甲', en: 'A' } });
  assert.match(err, /键不在 enum 选项中/);
});

test('enumLabels：每个值须同时带 zh 与 en', () => {
  assert.match(validateEnumLabels('status', ['lead'], { lead: { zh: '线索' } }), /缺 en 标签/);
  assert.match(validateEnumLabels('status', ['lead'], { lead: { zh: '', en: 'Lead' } }), /缺 zh 标签/);
});

test('enumLabels：拒绝会破坏生成代码的字符', () => {
  const err = validateEnumLabels('status', ['lead'], { lead: { zh: "客户's", en: 'Lead' } });
  assert.match(err, /引号|反斜杠|换行|插值/);
});

test('enumLabels：合法项返回 null', () => {
  assert.equal(validateEnumLabels('status', ['lead', 'active'], STATUS_LABELS), null);
  assert.equal(hasEnumLabels({ ...ENUM_FIELD, enumLabels: STATUS_LABELS }), true);
});

test('normalizeSpecFields：enumLabels 不被静默剥掉', () => {
  const kept = normalizeSpecFields([{ ...ENUM_FIELD, enumLabels: STATUS_LABELS }]);
  assert.deepEqual(kept[0].enumLabels, STATUS_LABELS);
  const none = normalizeSpecFields([{ ...ENUM_FIELD }]);
  assert.equal('enumLabels' in none[0], false);
});

// ─── Flutter ─────────────────────────────────────────────────────────────────

test('Flutter：有标签 → 查表 + 回落标识符', () => {
  const page = pageTemplate(labelled());
  assert.ok(page.includes('Text(_statusLabels(l10n)[o] ?? o),'), '表单控件应查标签并回落');
  assert.ok(page.includes('Map<String, String> _statusLabels(AppLocalizations l10n) => {'));
  assert.ok(page.includes("'lead': l10n.customersStatusLead,"));
  assert.ok(page.includes("'active': l10n.customersStatusActive,"));
});

test('Flutter：无标签 → 与既有行为一致（直接渲染标识符）', () => {
  const page = pageTemplate(unlabelled());
  assert.ok(page.includes('child: Text(o),'));
  assert.ok(!page.includes('_statusLabels'), '无标签时不得产出死代码');
});

// ─── Web admin ───────────────────────────────────────────────────────────────

test('Web admin：有标签 → 单元格走查表 + 回落原始值', () => {
  const view = adminViewTemplate(labelled());
  assert.ok(view.includes("{{ cellText('status', item.status) }}"));
  assert.ok(view.includes('enumLabels.value[key] ?? String(value ?? \'\')'));
  assert.ok(view.includes("'status:lead': t('customersStatusLead'),"));
});

test('Web admin：无标签 → 不产出查表/helper', () => {
  const view = adminViewTemplate(unlabelled());
  assert.ok(!view.includes('cellText'), '无标签时不得产出死代码');
  assert.ok(!view.includes('enumLabels'));
});

test('Web admin i18n：zh 与 en 标签成对且不同（G-9）', () => {
  const keys = adminI18nKeys(labelled());
  assert.equal(keys.zh.customersStatusLead, '线索');
  assert.equal(keys.en.customersStatusLead, 'Lead');
  assert.equal(keys.zh.customersStatusActive, '活跃');
  assert.equal(keys.en.customersStatusActive, 'Active');
  assert.notEqual(keys.zh.customersStatusLead, keys.en.customersStatusLead);
});

test('Web admin i18n：无标签 → 不新增标签键', () => {
  const keys = adminI18nKeys(unlabelled());
  assert.equal('customersStatusLead' in keys.zh, false);
  assert.equal('customersStatusLead' in keys.en, false);
});

// ─── Taro ────────────────────────────────────────────────────────────────────

test('Taro：首字段为带标签 enum → 显示标签并回落', () => {
  const page = taroPageTemplate(labelledFirst());
  assert.ok(page.includes('{{ statusLabels[item.status] ?? item.status }}'));
  assert.ok(page.includes("'lead': '线索',"), 'Taro 侧取 zh，与页面其余中文单语文案一致');
});

test('Taro：无标签 → 与既有行为一致', () => {
  const page = taroPageTemplate(ctxWith([{ ...ENUM_FIELD }, { name: 'name', type: 'string' }]));
  assert.ok(page.includes('{{ item.status }}'));
  assert.ok(!page.includes('statusLabels'));
});

// ─── Wire: generated localizations ───────────────────────────────────────────

test('wire：发射的 getter 声明同带 zh 与 en', () => {
  const decls = enumLabelGetterDecls(labelled());
  assert.ok(decls.includes("String get customersStatusLead => _t('Lead', '线索');"));
  assert.ok(decls.includes("String get customersStatusActive => _t('Active', '活跃');"));
  assert.equal(enumLabelGetterDecls(unlabelled()), '', '无标签时不得发射任何 getter');
});

// ─── G-11 cross-end consistency ──────────────────────────────────────────────

test('三端一致：同一 ctx 产出的 getter 名字集合完全相同', () => {
  const ctx = labelled();
  const expected = ctx.fields
    .filter((f) => hasEnumLabels(f))
    .flatMap((f) => f.enum.filter((o) => f.enumLabels[o]).map((o) => enumLabelGetter(ctx, f.name, o)));
  assert.deepEqual(expected, ['customersStatusLead', 'customersStatusActive']);

  const flutter = pageTemplate(ctx);
  const adminView = adminViewTemplate(ctx);
  const adminKeys = adminI18nKeys(ctx);
  const decls = enumLabelGetterDecls(ctx);
  for (const name of expected) {
    assert.ok(flutter.includes(`l10n.${name},`), `Flutter 应引用 ${name}`);
    assert.ok(adminKeys.zh[name], `管理台 zh 应有 ${name}`);
    assert.ok(adminKeys.en[name], `管理台 en 应有 ${name}`);
    assert.ok(decls.includes(`String get ${name} =>`), `本地化文件应声明 ${name}`);
    assert.ok(adminView.includes(`t('${name}')`), `管理台视图应引用 ${name}`);
  }
});

// ─── Schema (machine-readable face, kept consistent with the validator) ──────
// ─── schema（机读面，与校验器两层一致） ──────────────────────────────────────

test('schema：接受合法 enumLabels 形状', () => {
  const spec = {
    module: 'customers',
    label: '客户',
    fields: [{ ...ENUM_FIELD, enumLabels: STATUS_LABELS }],
  };
  assert.deepEqual(validateAgainstSchema(moduleSpecSchema, spec), []);
});

test('schema：白名单挡掉会破坏生成代码的字符（与 validateEnumLabels 两层一致）', () => {
  const badLabels = { lead: { zh: "客户's", en: 'Lead' } };
  const spec = {
    module: 'customers',
    label: '客户',
    fields: [{ ...ENUM_FIELD, enumLabels: badLabels }],
  };
  const errs = validateAgainstSchema(moduleSpecSchema, spec);
  assert.ok(errs.length > 0, 'schema 应拒绝含引号的标签');
  assert.match(errs.join('\n'), /pattern/);
  // 同一输入运行时校验器也拒绝 —— 两层不互相矛盾
  assert.match(validateEnumLabels('status', ['lead', 'active'], badLabels), /引号/);
});
