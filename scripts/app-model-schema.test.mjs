// SPDX-License-Identifier: Apache-2.0

/**
 * CE-2 PC-7：Application Model JSON Schema + 零依赖校验器单测（node --test）。
 * 正向：仓内真实 `specs/*.json` / manifest 必须过 schema（与 `npm run check:app-model` 同源）。
 * 反向：坏模型必须被拒（漏字段 / 类型越界 / enum 越界 / 未知字段 / 常量不符）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validate } from './generator/schema-validate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCHEMAS = join(ROOT, 'scripts/generator/schemas');
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const moduleSpec = load(join(SCHEMAS, 'module-spec.schema.json'));
const manifest = load(join(SCHEMAS, 'manifest.schema.json'));
const provenance = load(join(SCHEMAS, 'module-provenance.schema.json'));

test('校验器：类型 / 必需 / 枚举 / pattern / 数组元素 / 未知字段', () => {
  const s = {
    type: 'object',
    required: ['a'],
    additionalProperties: false,
    properties: {
      a: { type: 'string', pattern: '^[a-z]+$' },
      b: { type: 'array', minItems: 2, items: { type: 'number' } },
      c: { enum: ['x', 'y'] },
    },
  };
  assert.deepEqual(validate(s, { a: 'ok' }), []);
  assert.deepEqual(validate(s, { a: 'ok', b: [1, 2], c: 'x' }), []);
  assert.match(validate(s, {})[0], /缺必需字段 a/);
  assert.match(validate(s, { a: 'OK' })[0], /不匹配 pattern/);
  assert.match(validate(s, { a: 'ok', extra: 1 })[0], /不允许的字段 extra/);
  assert.match(validate(s, { a: 'ok', b: [1] })[0], /元素数应 ≥ 2/);
  assert.match(validate(s, { a: 'ok', b: ['1', 2] })[0], /类型应为 number/);
  assert.match(validate(s, { a: 'ok', c: 'z' })[0], /取值应为/);
});

test('校验器：const / 布尔或对象联合类型（aiTools 分支）', () => {
  const s = {
    type: ['boolean', 'object'],
    additionalProperties: false,
    properties: { riskLevel: { type: 'string', pattern: '^R[0-5]$' } },
  };
  assert.deepEqual(validate(s, false), []);
  assert.deepEqual(validate(s, { riskLevel: 'R3' }), []);
  assert.match(validate(s, { riskLevel: 'R9' })[0], /不匹配 pattern/);
  assert.match(validate(s, { bogus: 1 })[0], /不允许的字段 bogus/);
  assert.match(validate({ const: 1 }, 2)[0], /应恒为 1/);
});

test('module-spec：仓内真实 specs/*.json 全部通过', () => {
  const dir = join(ROOT, 'specs');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.openapi.json'));
  assert.ok(files.length > 0, 'specs/ 下应有模块协议 spec');
  for (const f of files) {
    assert.deepEqual(validate(moduleSpec, load(join(dir, f))), [], `${f} 应过 module-spec schema`);
  }
});

test('module-spec：坏模型被拒（漏字段 / 命名越界 / 类型越界 / enum 选项非法 / 未知字段）', () => {
  const base = { module: 'invoices', label: '发票', fields: [{ name: 'invoiceNo', type: 'string' }] };
  assert.deepEqual(validate(moduleSpec, base), []);
  assert.match(validate(moduleSpec, { label: 'x', fields: [] })[0], /缺必需字段 module/);
  assert.match(validate(moduleSpec, { ...base, module: 'Invoices' })[0], /不匹配 pattern/);
  assert.match(validate(moduleSpec, { ...base, fields: [{ name: 'x', type: 'float' }] })[0], /取值应为/);
  assert.match(
    validate(moduleSpec, { ...base, fields: [{ name: 'x', type: 'enum', enum: ['ok'] }] })[0],
    /元素数应 ≥ 2/,
  );
  assert.match(
    validate(moduleSpec, { ...base, fields: [{ name: 'x', type: 'enum', enum: ['OK', 'no'] }] })[0],
    /不匹配 pattern/,
  );
  assert.match(validate(moduleSpec, { ...base, bogus: 1 })[0], /不允许的字段 bogus/);
});

test('module-spec：business-spec 映射器产出形状通过（module+plural+searchable+aiTools）', () => {
  const mapped = {
    module: 'followup_plans',
    plural: 'followup_plans',
    label: '跟进计划',
    searchable: true,
    fields: [
      { name: 'title', type: 'string', label: '标题', required: true },
      { name: 'status', type: 'enum', label: '状态', enum: ['draft', 'active'] },
    ],
    aiTools: { query: { riskLevel: 'R1' }, create: false },
  };
  assert.deepEqual(validate(moduleSpec, mapped), []);
});

test('module-provenance：writeModuleProvenance 的真实输出过 schema（防生成↔契约漂移）', async () => {
  // 仓内无常驻 provenance 文件（可移除制品）→ 门禁的 provenance 分支在本仓恒为空，
  // 故此处直接跑**真实写入函数**再校验其输出，避免「写出来的形状 ↔ 冻结 schema」静默漂移。
  const { writeModuleProvenance, moduleProvenancePath } = await import('./generator/manifest.mjs');
  const root = mkdtempSync(join(os.tmpdir(), 'kb-prov-'));
  try {
    await writeModuleProvenance('invoices', 'spec:invoices.json', root);
    const written = JSON.parse(readFileSync(join(root, moduleProvenancePath('invoices')), 'utf8'));
    assert.deepEqual(validate(provenance, written), []);
    assert.equal(written.source, 'spec:invoices.json');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('manifest / module-provenance：真实形状通过 + 常量与必填被强制', () => {
  const m = {
    schema: 1,
    identity: 'keelbase-application',
    generator: 'keelbase',
    generatorVersion: '1.0.0',
    protocol: '1.0',
    modules: ['posts'],
  };
  assert.deepEqual(validate(manifest, m), []);
  assert.deepEqual(validate(manifest, load(join(ROOT, '.keelbase/manifest.json'))), []);
  assert.match(validate(manifest, { ...m, schema: 2 })[0], /应恒为 1/);
  assert.match(validate(manifest, { ...m, identity: 'other' })[0], /应恒为/);
  assert.match(validate(manifest, { ...m, modules: ['Bad'] })[0], /不匹配 pattern/);

  const p = {
    schema: 1,
    module: 'posts',
    generator: 'keelbase',
    generatorVersion: '1.0.0',
    protocol: '1.0',
    source: 'spec:posts.json',
    generatedAt: '2026-09-12T00:00:00.000Z',
  };
  assert.deepEqual(validate(provenance, p), []);
  assert.match(validate(provenance, { ...p, generatedAt: '刚刚' })[0], /不匹配 pattern/);
  assert.match(validate(provenance, { ...p, generator: 'other' })[0], /应恒为/);
});
