// SPDX-License-Identifier: Apache-2.0

/**
 * P0-9e `ref` (relation) field tests (node:test, zero dependency).
 * Run: node --test scripts/ref-field.test.mjs
 *
 * P0-9e `ref`（关联）字段单测（node:test，零依赖）。
 * 运行：node --test scripts/ref-field.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  buildContext,
  normalizeSpecFields,
  refColumnName,
  refFields,
  refOnDelete,
  refTarget,
  toSnake,
  validateFields,
  validateRefField,
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

const REF_FIELD = { name: 'customer', type: 'ref', target: 'customers', display: 'name' };

function ctxWith(fields) {
  return buildContext('orders', '订单', normalizeSpecFields(fields));
}

// ─── Validator ───────────────────────────────────────────────────────────────

test('ref：须声明 target 与 display', () => {
  assert.equal(validateRefField({ ...REF_FIELD }), null);
  assert.match(validateRefField({ name: 'customer', type: 'ref', display: 'name' }), /须声明 target/);
  assert.match(validateRefField({ name: 'customer', type: 'ref', target: 'customers' }), /须声明 display/);
  assert.match(validateRefField({ name: 'customer', type: 'ref', target: 'Customers', display: 'name' }), /须声明 target/);
});

test('ref：onDelete 取值受限，缺省为 restrict（不级联）', () => {
  assert.equal(validateRefField({ ...REF_FIELD, onDelete: 'cascade' }), null);
  assert.equal(validateRefField({ ...REF_FIELD, onDelete: 'setNull' }), null);
  assert.match(validateRefField({ ...REF_FIELD, onDelete: 'nuke' }), /restrict \/ setNull \/ cascade/);
  assert.equal(refOnDelete({ type: 'ref' }), 'restrict');
  assert.equal(refOnDelete({ type: 'ref', onDelete: 'cascade' }), 'cascade');
});

test('ref 三键只允许出现在 ref 字段上', () => {
  assert.match(validateRefField({ name: 'x', type: 'int', target: 'customers' }), /不是 ref/);
  assert.match(validateRefField({ name: 'x', type: 'string', display: 'name' }), /不是 ref/);
  assert.match(validateRefField({ name: 'x', type: 'string', onDelete: 'cascade' }), /不是 ref/);
});

test('ref：经 validateFields 生效', () => {
  assert.match(validateFields([{ name: 'customer', type: 'ref', target: 'customers' }]), /须声明 display/);
  assert.equal(validateFields([REF_FIELD]), null);
});

test('refColumnName / refFields / toSnake：列名单源', () => {
  assert.equal(refColumnName('customer'), 'customerId');
  assert.equal(toSnake('customerId'), 'customer_id');
  const refs = refFields(normalizeSpecFields([REF_FIELD, { name: 'title', type: 'string' }]));
  assert.equal(refs.length, 1);
  assert.equal(refs[0].column, 'customerId');
  assert.deepEqual(refTarget('customers'), { plural: 'customers', singular: 'customer', pascal: 'Customer' });
});

test('normalizeSpecFields：ref 三键不被静默剥掉', () => {
  const kept = normalizeSpecFields([{ ...REF_FIELD, onDelete: 'cascade' }]);
  assert.equal(kept[0].target, 'customers');
  assert.equal(kept[0].display, 'name');
  assert.equal(kept[0].onDelete, 'cascade');
});

// ─── Backend generator ───────────────────────────────────────────────────────

test('后端实体：外键列 + 关系属性 + 索引 + 关系导入（照旗舰写法）', () => {
  const entity = entityTemplate(ctxWith([REF_FIELD]));
  assert.ok(entity.includes("name: 'customer_id'"), '外键列名须显式给出');
  assert.ok(entity.includes('customerId?: number | null;'));
  assert.ok(entity.includes('ManyToOne') && entity.includes('JoinColumn'), '关系装饰器须导入');
  assert.ok(entity.includes("import { Customer } from '../customers/customer.entity';"));
  assert.ok(entity.includes("@ManyToOne(() => Customer, { onDelete: 'RESTRICT', nullable: true })"));
  assert.ok(entity.includes("@JoinColumn({ name: 'customer_id' })"));
  assert.ok(entity.includes("@Index(['customerId'])"));
});

test('后端实体：onDelete 缺省 restrict；显式 cascade 时映射为 CASCADE', () => {
  assert.ok(entityTemplate(ctxWith([REF_FIELD])).includes("onDelete: 'RESTRICT'"));
  assert.ok(entityTemplate(ctxWith([{ ...REF_FIELD, onDelete: 'cascade' }])).includes("onDelete: 'CASCADE'"));
  assert.ok(entityTemplate(ctxWith([{ ...REF_FIELD, onDelete: 'setNull' }])).includes("onDelete: 'SET NULL'"));
});

test('后端模块：导入目标实体并加进 forFeature', () => {
  const mod = moduleTemplate(ctxWith([REF_FIELD]));
  assert.ok(mod.includes("import { Customer } from '../customers/customer.entity';"));
  assert.ok(mod.includes('TypeOrmModule.forFeature([Order, Customer])'));
});

test('后端服务：注入目标仓储 + 写侧校验 + 读侧 relations', () => {
  const svc = serviceTemplate(ctxWith([REF_FIELD]));
  assert.ok(svc.includes('BadRequestException'));
  assert.ok(svc.includes('@InjectRepository(Customer)'));
  assert.ok(svc.includes('private readonly customersRepository: Repository<Customer>,'));
  assert.ok(svc.includes('private async _assertRefs(dto: {'));
  assert.ok(svc.includes('if (!found) throw new BadRequestException('));
  assert.ok(svc.includes('await this._assertRefs(dto);'));
  assert.ok(svc.includes('relations: { customer: true }'));
});

test('后端 DTO：只暴露外键 id', () => {
  const dto = createDtoTemplate(ctxWith([REF_FIELD]));
  assert.ok(dto.includes('customerId?: number;'));
  assert.ok(dto.includes('@IsInt()'));
});

test('自引用：生成时明确报错，不静默产出坏模块', () => {
  const selfCtx = buildContext('categories', '分类', normalizeSpecFields([
    { name: 'parent', type: 'ref', target: 'categories', display: 'name' },
  ]));
  assert.throws(() => entityTemplate(selfCtx), /自引用关联暂不支持/);
});

test('无 ref 字段 → 不产关系代码（不产死代码）', () => {
  const plain = ctxWith([{ name: 'title', type: 'string' }]);
  const entity = entityTemplate(plain);
  const svc = serviceTemplate(plain);
  const mod = moduleTemplate(plain);
  assert.ok(!entity.includes('ManyToOne'));
  assert.ok(!entity.includes('@Index([\'customerId\'])'));
  assert.ok(!svc.includes('_assertRefs'));
  assert.ok(!svc.includes('BadRequestException'));
  assert.ok(mod.includes('TypeOrmModule.forFeature([Order])'));
});

test('带 ref 的 ctx 能跑遍所有模板（漏一个映射即抛错）', () => {
  const ctx = ctxWith([REF_FIELD]);
  for (const fn of ALL_TEMPLATES) {
    assert.doesNotThrow(() => fn(ctx), `${fn.name} 未处理带 ref 的 ctx`);
  }
});

test('Flutter：控制器与 dispose 用同一套列名（否则编译不过）', () => {
  const page = pageTemplate(ctxWith([REF_FIELD]));
  assert.ok(page.includes('final _customerIdCtrl = TextEditingController();'));
  assert.ok(page.includes('_customerIdCtrl.dispose();'), 'dispose 必须用同一变量名');
  assert.ok(page.includes("data['customerId'] = int.tryParse("));
});

// ─── Schema ──────────────────────────────────────────────────────────────────

test('schema：接受 ref（位置与取值规则由 validateRefField 管）', () => {
  const spec = { module: 'orders', label: '订单', fields: [REF_FIELD] };
  assert.deepEqual(validateAgainstSchema(moduleSpecSchema, spec), []);

  const bad = {
    module: 'orders',
    label: '订单',
    fields: [{ name: 'customer', type: 'ref', target: 'customers', display: 'name', onDelete: 'nuke' }],
  };
  assert.ok(validateAgainstSchema(moduleSpecSchema, bad).length > 0, 'onDelete 越界应由 schema 拦下');
});
