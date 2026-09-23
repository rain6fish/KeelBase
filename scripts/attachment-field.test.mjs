// SPDX-License-Identifier: Apache-2.0

/**
 * P0-9h `attachment` field tests (node:test, zero dependency).
 * Run: node --test scripts/attachment-field.test.mjs
 *
 * P0-9h `attachment` 字段单测（node:test，零依赖）。
 * 运行：node --test scripts/attachment-field.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_TYPES,
  attachmentArtifacts,
  attachmentFields,
  buildContext,
  normalizeSpecFields,
  validateFields,
} from './generator/validate.mjs';
import {
  attachmentDtoTemplate,
  attachmentEntityTemplate,
  backendFiles,
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
import { createRequire } from 'node:module';

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
  attachmentEntityTemplate,
  attachmentDtoTemplate,
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

const ATT_FIELD = { name: 'contract', type: 'attachment' };

function ctxWith(fields) {
  return buildContext('orders', '订单', normalizeSpecFields(fields));
}

// ─── Contract ────────────────────────────────────────────────────────────────

test('attachment：合法声明（无伴生键）；attachmentFields 与命名单源', () => {
  assert.equal(validateFields([ATT_FIELD]), null);
  assert.deepEqual(attachmentFields(normalizeSpecFields([ATT_FIELD, { name: 'invoice', type: 'attachment' }])), [
    'contract',
    'invoice',
  ]);
  const att = attachmentArtifacts(ctxWith([ATT_FIELD]));
  assert.equal(att.className, 'OrderAttachment');
  assert.equal(att.fileName, 'order-attachment.entity.ts');
  assert.equal(att.table, 'orders_attachments');
  assert.equal(att.ownerColumn, 'orderId');
  assert.equal(att.ownerColumnDb, 'order_id');
});

// ─── Backend: side table ─────────────────────────────────────────────────────

test('侧表实体：真外键指回 owner + 索引 + 字段列', () => {
  const entity = attachmentEntityTemplate(ctxWith([ATT_FIELD]));
  assert.ok(entity.includes("@Entity('orders_attachments')"));
  assert.ok(entity.includes("name: 'order_id'"));
  assert.ok(entity.includes('@ManyToOne(() => Order, { onDelete: \'CASCADE\' })'));
  assert.ok(entity.includes('@JoinColumn({ name: \'order_id\' })'));
  assert.ok(entity.includes("@Index(['orderId'])"));
  assert.ok(entity.includes('field!: string;'));
  assert.ok(entity.includes('storageKey!: string;'), '存的是存储键，不是裸 URL');
  assert.ok(entity.includes('@DeleteDateColumn'));
});

test('主实体：只加一条附件关系、不落列，且每模块只发一次', () => {
  const one = entityTemplate(ctxWith([ATT_FIELD]));
  const two = entityTemplate(ctxWith([ATT_FIELD, { name: 'invoice', type: 'attachment' }]));
  for (const entity of [one, two]) {
    assert.ok(entity.includes('@OneToMany(() => OrderAttachment, (attachment) => attachment.owner)'));
    assert.ok(entity.includes('attachments?: OrderAttachment[];'));
    assert.ok(entity.includes("import { OrderAttachment } from './order-attachment.entity';"));
    assert.ok(entity.includes('OneToMany'), '须导入 OneToMany');
    // 一个模块一张侧表 → 关系只能出现一次，哪怕声明了两个附件字段
    assert.equal(entity.split('@OneToMany(').length - 1, 1);
  }
});

test('模块：注册侧表实体', () => {
  const mod = moduleTemplate(ctxWith([ATT_FIELD]));
  assert.ok(mod.includes("import { OrderAttachment } from './order-attachment.entity';"));
  assert.ok(mod.includes('TypeOrmModule.forFeature([Order, OrderAttachment])'));
});

// ─── Backend: endpoints + ownership ─────────────────────────────────────────

test('服务：三个方法都先经 owner 做所有权检查（权限继承，不另立一套）', () => {
  const svc = serviceTemplate(ctxWith([ATT_FIELD]));
  assert.ok(svc.includes('@InjectRepository(OrderAttachment)'));
  assert.ok(svc.includes('private readonly attachmentsRepository: Repository<OrderAttachment>,'));
  assert.ok(svc.includes("const ORDER_ATTACHMENT_FIELDS = ['contract'];"));
  assert.ok(svc.includes('async listAttachments(id: number, ability: AppAbility)'));
  assert.ok(svc.includes('async addAttachment('));
  assert.ok(svc.includes('async removeAttachment('));
  // 三处都必须先 findOne（owner 检查），再动附件
  assert.equal(svc.split('const owner = await this.findOne(id, ability);').length - 1, 3);
  assert.ok(svc.includes("throw new BadRequestException('未知的附件字段')"));
  assert.ok(svc.includes('await this.attachmentsRepository.softDelete(attachmentId);'));
});

test('控制器：三个端点齐备', () => {
  const ctrl = controllerTemplate(ctxWith([ATT_FIELD]));
  assert.ok(ctrl.includes("import { AddOrderAttachmentDto } from './dto/add-order-attachment.dto';"));
  assert.ok(ctrl.includes("@Get(':id/attachments')"));
  assert.ok(ctrl.includes("@Post(':id/attachments')"));
  assert.ok(ctrl.includes("@Delete(':id/attachments/:attachmentId')"));
});

test('DTO：field 被限制在已声明字段内', () => {
  const dto = attachmentDtoTemplate(ctxWith([ATT_FIELD]));
  assert.ok(dto.includes('@IsIn([\'contract\'])'));
  assert.ok(dto.includes('storageKey!: string;'));
});

test('backendFiles：有附件时多出侧表实体与 DTO 两个文件', () => {
  const withAtt = backendFiles(ctxWith([ATT_FIELD])).map((f) => f.path);
  const without = backendFiles(ctxWith([{ name: 'title', type: 'string' }])).map((f) => f.path);
  assert.equal(without.length, 8);
  assert.equal(withAtt.length, 10);
  assert.ok(withAtt.includes('orders/order-attachment.entity.ts'));
  assert.ok(withAtt.includes('orders/dto/add-order-attachment.dto.ts'));
});

test('无附件字段 → 不产侧表与附件方法（不产死代码）', () => {
  const ctx = ctxWith([{ name: 'title', type: 'string' }]);
  assert.ok(!entityTemplate(ctx).includes('OneToMany'));
  assert.ok(!serviceTemplate(ctx).includes('attachmentsRepository'));
  assert.ok(!controllerTemplate(ctx).includes('attachments'));
  assert.ok(moduleTemplate(ctx).includes('TypeOrmModule.forFeature([Order])'));
});

// ─── Frontend ────────────────────────────────────────────────────────────────

test('Flutter：模型带附件名列表，且不上传/不提交', () => {
  const model = modelTemplate(ctxWith([ATT_FIELD]));
  assert.ok(model.includes('final List<String> contractNames;'));
  assert.ok(model.includes("json['attachments']"));
  assert.ok(model.includes("(a as Map)['field'] == 'contract'"));
});

test('Flutter：附件没有控制器 —— dispose 不得引用不存在的变量', () => {
  const page = pageTemplate(ctxWith([ATT_FIELD, { name: 'title', type: 'string' }]));
  assert.ok(page.includes('_titleCtrl.dispose();'));
  assert.ok(!page.includes('_contractCtrl'), '附件不产控制器，dispose 必须跳过它');
});

test('schema 与 FIELD_TYPES 两层一致：闭集里每个类型都必须被 schema 接受', () => {
  // 起因（2026-09-23 实际发生过）：`attachment` 加进了 FIELD_TYPES 却漏加进 schema 的类型
  // 枚举 —— 由于当时没有 spec 用它，`check:app-model` 依然全绿，两层已不一致却无人知。
  // 这条守卫遍历闭集逐个喂给 schema，把「加类型只改了一处」当场变红。
  for (const type of FIELD_TYPES) {
    const field = { name: 'sample', type };
    if (type === 'enum') field.enum = ['a1', 'b2'];
    if (type === 'decimal') field.scale = 2;
    if (type === 'ref') {
      field.target = 'customers';
      field.display = 'name';
    }
    const spec = { module: 'samples', label: '样本', fields: [field] };
    assert.deepEqual(validateAgainstSchema(moduleSpecSchema, spec), [], `schema 未接受类型 ${type}`);
  }
});

// ─── Slice 2: upload control + echo（断言来自真机实证） ──────────────────────

test('模型：copyWith 按成员名（contractNames），不用协议字段名', () => {
  const model = modelTemplate(ctxWith([ATT_FIELD]));
  assert.ok(model.includes('Object? contractNames = const Object()'));
  assert.ok(!model.includes('Object? contract = const Object()'));
});

test('页面：附件按行上传 —— 复用既有 /upload 管线，再登记关联', () => {
  const page = pageTemplate(ctxWith([ATT_FIELD]));
  assert.ok(page.includes('FilePicker.platform.pickFiles()'));
  assert.ok(page.includes('final client = context.read<ApiClient>();'), 'client 须在 await 之前取');
  assert.ok(page.includes('await client.uploadFile(file.path!, file.name);'), '上传须复用既有管线');
  assert.ok(page.includes("await client.post('/orders/\$ownerId/attachments'"));
  assert.ok(page.includes("'field': 'contract',"));
  assert.ok(page.includes("'storageKey': uploaded['filename'],"), '存的是存储键');
  assert.ok(page.includes('_attachContract(item.id)'), '上传入口挂在列表行上（新建时还没有 owner id）');
  assert.ok(page.includes("import 'package:file_picker/file_picker.dart';"));
});

test('页面：回显附件名（用 Model 类型）', () => {
  const page = pageTemplate(ctxWith([ATT_FIELD]));
  assert.ok(page.includes("if (item.contractNames.isNotEmpty) item.contractNames.join('、'),"));
  assert.ok(page.includes('_echo(OrderModel item)'));
});

test('管理台：接口带 attachments 数组 + 名字 helper + 单元格', () => {
  const api = adminApiTemplate(ctxWith([ATT_FIELD]));
  assert.ok(api.includes('attachments?: Array<Record<string, unknown>>;'));
  assert.ok(!api.includes('contract: string;'), '附件不在接口里逐字段展开');
  const view = adminViewTemplate(ctxWith([ATT_FIELD]));
  assert.ok(view.includes('function attachmentNames(item: AdminOrder, field: string): string[]'));
  assert.ok(view.includes("{{ attachmentNames(item, 'contract').join('、') }}"));
});

test('带 attachment 的 ctx 能跑遍所有模板（漏一个映射即抛错）', () => {
  const ctx = ctxWith([ATT_FIELD]);
  for (const fn of ALL_TEMPLATES) {
    assert.doesNotThrow(() => fn(ctx), `${fn.name} 未处理带 attachment 的 ctx`);
  }
});
