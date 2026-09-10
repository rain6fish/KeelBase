// SPDX-License-Identifier: Apache-2.0

/**
 * Business Spec → Module Protocol 映射器单测（node:test，零依赖）。
 * 运行：node --test scripts/business-spec.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mapBusinessSpec, validateBusinessSpec } from './generator/business-spec.mjs';
import { validateModuleName, validateFields, validateAiTools } from './generator/validate.mjs';

/** 最小合法 Business Spec */
function baseSpec(over = {}) {
  return {
    feature: 'demo',
    goal: '演示目标',
    actors: ['sales'],
    objects: [
      {
        name: 'item',
        label: '条目',
        module: 'items',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'status', type: 'enum', enum: ['open', 'closed'] },
        ],
      },
    ],
    ...over,
  };
}

/* ═══════════ 可映射（正常路径） ═══════════ */

test('可映射：产出合法 Module Protocol 并透传字段/searchable', () => {
  const r = mapBusinessSpec(baseSpec({
    objects: [{
      name: 'item',
      label: '条目',
      module: 'items',
      searchable: true,
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'priority', type: 'enum', enum: ['low', 'high'] },
        { name: 'note', type: 'text' },
      ],
    }],
  }));

  assert.equal(r.error, undefined);
  assert.equal(r.protocol.module, 'items');
  assert.equal(r.protocol.plural, 'items');
  assert.equal(r.protocol.label, '条目');
  assert.equal(r.protocol.searchable, true);
  assert.equal(validateModuleName(r.protocol.module), null);
  assert.equal(validateFields(r.protocol.fields), null);
  assert.deepEqual(r.protocol.fields[1], { name: 'priority', type: 'enum', enum: ['low', 'high'] });
});

test('可映射：module 缺省时由对象名复数化', () => {
  const spec = baseSpec();
  delete spec.objects[0].module;
  const r = mapBusinessSpec(spec);
  assert.equal(r.error, undefined);
  assert.equal(r.protocol.module, 'items');
});

test('可映射：read/write 能力 → aiTools query/create 并透传风险级', () => {
  const r = mapBusinessSpec(baseSpec({
    aiCapabilities: [
      { object: 'item', kind: 'read' },
      { object: 'item', kind: 'write', riskLevel: 'R4', requiresConfirmation: true },
    ],
  }));
  assert.equal(r.error, undefined);
  assert.deepEqual(r.protocol.aiTools, {
    query: true,
    create: { riskLevel: 'R4', requiresConfirmation: true },
  });
  assert.equal(validateAiTools(r.protocol.aiTools), null);
});

test('可映射：无 aiCapabilities 时不声明 aiTools（走生成器默认 R1/R3）', () => {
  const r = mapBusinessSpec(baseSpec());
  assert.equal(r.error, undefined);
  assert.equal(r.protocol.aiTools, undefined);
});

/* ═══════════ fail-closed（不可映射清单） ═══════════ */

test('fail-closed：业务规则进 unmapped，不影响生成', () => {
  const r = mapBusinessSpec(baseSpec({ rules: ['同一客户不重复', '日期须在未来'] }));
  assert.equal(r.error, undefined);
  assert.equal(r.unmapped.length, 2);
  assert.match(r.unmapped[0].reason, /业务规则/);
  assert.equal(r.protocol.fields.length, 2);
});

test('fail-closed：多业务对象进 unmapped（薄协议一次一个模块）', () => {
  const spec = baseSpec();
  spec.objects.push({ name: 'extra', label: '多余', fields: [{ name: 'x', type: 'string' }] });
  const r = mapBusinessSpec(spec);
  assert.equal(r.error, undefined);
  assert.equal(r.unmapped.length, 1);
  assert.match(r.unmapped[0].reason, /一次只映射一个业务对象/);
  assert.equal(r.protocol.module, 'items');
});

test('fail-closed：多角色进 unmapped（协议固定本人所有权）', () => {
  const r = mapBusinessSpec(baseSpec({ actors: ['sales', 'manager'] }));
  assert.equal(r.error, undefined);
  assert.equal(r.unmapped.length, 1);
  assert.match(r.unmapped[0].action, /CASL/);
});

test('fail-closed：超范围字段类型不进 fields，记入 unmapped', () => {
  const spec = baseSpec();
  spec.objects[0].fields.push({ name: 'amount', type: 'money' });
  const r = mapBusinessSpec(spec);
  assert.equal(r.error, undefined);
  assert.equal(r.protocol.fields.some((f) => f.name === 'amount'), false);
  assert.match(r.unmapped[0].reason, /money/);
});

test('fail-closed：关联字段降级为 int 列并记入 unmapped', () => {
  const spec = baseSpec();
  spec.objects[0].fields.push({ name: 'customerRef', relation: { to: 'customer' } });
  const r = mapBusinessSpec(spec);
  assert.equal(r.error, undefined);
  const ref = r.protocol.fields.find((f) => f.name === 'customerRef');
  assert.equal(ref.type, 'int');
  assert.match(r.unmapped[0].reason, /关联字段/);
});

test('fail-closed：非 read/write 的 AI 能力进 unmapped', () => {
  const r = mapBusinessSpec(baseSpec({
    aiCapabilities: [{ object: 'item', kind: 'analyze' }],
  }));
  assert.equal(r.error, undefined);
  assert.match(r.unmapped[0].reason, /不自动化/);
  assert.equal(r.protocol.aiTools, undefined);
});

test('fail-closed：decisions/acceptance/outOfScope 进 notes，不进 unmapped', () => {
  const r = mapBusinessSpec(baseSpec({
    decisions: [{ question: 'q', choice: 'c' }],
    acceptance: ['a'],
    outOfScope: ['b'],
  }));
  assert.equal(r.error, undefined);
  assert.equal(r.unmapped.length, 0);
  for (const key of ['decisions', 'acceptance', 'outOfScope']) {
    assert.ok(r.notes.some((n) => n.includes(key)), `缺少 ${key} 的溯源 note`);
  }
});

/* ═══════════ 交付溯源链 ═══════════ */

test('溯源链：evidenceRef 指向存在的文件 → 无告警', () => {
  const r = mapBusinessSpec(baseSpec({ evidenceRef: 'package.json' }));
  assert.equal(r.error, undefined);
  assert.equal(r.warnings.length, 0);
});

test('溯源链：evidenceRef 指向不存在的文件 → 进 warnings（可生成，但缺陷可见）', () => {
  const r = mapBusinessSpec(baseSpec({ evidenceRef: '.keelbase/interview/does-not-exist.md' }));
  assert.equal(r.error, undefined);
  assert.equal(r.protocol.module, 'items');
  assert.equal(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('evidenceRef') && r.warnings[0].includes('不存在'));
});

test('溯源链：未声明 evidenceRef → 不产生告警', () => {
  const r = mapBusinessSpec(baseSpec());
  assert.equal(r.warnings.length, 0);
});

/* ═══════════ 非法输入（硬失败） ═══════════ */

test('非法：结构缺失逐一拒绝', () => {
  assert.match(validateBusinessSpec(null), /必须是对象/);
  assert.match(validateBusinessSpec(baseSpec({ feature: '' })), /feature/);
  assert.match(validateBusinessSpec(baseSpec({ goal: '' })), /goal/);
  assert.match(validateBusinessSpec(baseSpec({ actors: [] })), /actors/);
  assert.match(validateBusinessSpec(baseSpec({ objects: [] })), /objects/);
});

test('非法：objects[0].fields 非数组 / 为空', () => {
  const spec = baseSpec();
  spec.objects[0].fields = 'nope';
  assert.match(mapBusinessSpec(spec).error, /fields/);

  const empty = baseSpec();
  empty.objects[0].fields = [];
  assert.match(mapBusinessSpec(empty).error, /没有可映射/);
});

test('非法：模块名不合法', () => {
  const spec = baseSpec();
  spec.objects[0].module = 'Items';
  assert.match(mapBusinessSpec(spec).error, /模块名/);
});

test('非法：保留字段名被拒', () => {
  const spec = baseSpec();
  spec.objects[0].fields.push({ name: 'id', type: 'int' });
  assert.match(mapBusinessSpec(spec).error, /保留词/);
});

test('非法：enum 选项不足或不合法', () => {
  const few = baseSpec();
  few.objects[0].fields.push({ name: 'state', type: 'enum', enum: ['only'] });
  assert.match(mapBusinessSpec(few).error, /2-10/);

  const bad = baseSpec();
  bad.objects[0].fields.push({ name: 'state', type: 'enum', enum: ['Open', 'Closed'] });
  assert.match(mapBusinessSpec(bad).error, /enum 选项非法/);
});

test('非法：aiTools 风险级与确认要求冲突', () => {
  const r = mapBusinessSpec(baseSpec({
    aiCapabilities: [{ object: 'item', kind: 'write', riskLevel: 'R3', requiresConfirmation: false }],
  }));
  assert.match(r.error, /requiresConfirmation=false/);
});
