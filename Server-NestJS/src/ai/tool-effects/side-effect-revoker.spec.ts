// SPDX-License-Identifier: Apache-2.0

/**
 * SideEffectRevoker 工具函数测试
 *
 * 覆盖 entityFor / resolveLocalEntity（resultType → 本地业务实体，撤销/快照目标解析），
 * 含 #4 生成模块（元数据解析）与 LocalEntityRevoker 的 canHandle/revoke/describeTarget。
 */

import { entityFor, resolveLocalEntity, LocalEntityRevoker } from './side-effect-revoker';

describe('entityFor', () => {
  it('映射本地业务实体（含 create_contract 的 contract 与 create_todo 的 todo）', () => {
    expect(entityFor('event')).toBe('Event');
    expect(entityFor('crm_task')).toBe('CrmTask');
    expect(entityFor('pm_task')).toBe('PmTask');
    expect(entityFor('app_request')).toBe('ApprovalRequest');
    expect(entityFor('contract')).toBe('Contract');
    expect(entityFor('todo')).toBe('Todo');
  });

  it('proxy_call → null（外部系统目标，无本地实体）', () => {
    expect(entityFor('proxy_call')).toBeNull();
  });

  it('未知 resultType fail closed → null（防误删本地实体）', () => {
    expect(entityFor('unknown_type')).toBeNull();
    expect(entityFor('crm_customer')).toBeNull();
  });
});

describe('resolveLocalEntity（#4 元数据兜底）', () => {
  const invoiceMeta = {
    name: 'Invoice',
    targetName: 'Invoice',
    tableName: 'invoices',
    deleteDateColumn: { propertyName: 'deletedAt' },
    columns: [{ propertyName: 'invoiceNo' }, { propertyName: 'dueDate' }, { propertyName: 'name' }],
  };
  const em = () =>
    ({ connection: { entityMetadatas: [invoiceMeta] } }) as any;

  it('显式别名优先（event → Event），不经元数据', () => {
    expect(resolveLocalEntity(em(), 'event')).toEqual({ name: 'Event', displayCol: 'title' });
  });

  it('生成模块 type=invoice → 元数据解析 Invoice + 展示列 name', () => {
    expect(resolveLocalEntity(em(), 'invoice')).toEqual({ name: 'Invoice', displayCol: 'name' });
  });

  it('proxy_call → null（外部目标）', () => {
    expect(resolveLocalEntity(em(), 'proxy_call')).toBeNull();
  });

  it('无软删列的类型 → null（不软删只读/外部目标，fail closed）', () => {
    const emNoDelete = () =>
      ({
        connection: {
          entityMetadatas: [{ name: 'SomeReadOnly', targetName: 'SomeReadOnly', tableName: 'some_read_only', deleteDateColumn: null, columns: [] }],
        },
      }) as any;
    expect(resolveLocalEntity(emNoDelete(), 'some_read_only')).toBeNull();
  });

  it('元数据无 title/name/subject/label 展示列 → displayCol null（describeTarget 不强取 title）', () => {
    const noDisplayMeta = {
      name: 'Invoice',
      targetName: 'Invoice',
      tableName: 'invoices',
      deleteDateColumn: { propertyName: 'deletedAt' },
      columns: [{ propertyName: 'invoiceNo' }],
    };
    const emNoDisplay = () =>
      ({ connection: { entityMetadatas: [noDisplayMeta] } }) as any;
    expect(resolveLocalEntity(emNoDisplay(), 'invoice')).toEqual({ name: 'Invoice', displayCol: null });
  });

  it('md.name 不匹配但表名命中 + 大小写不敏感（type=Orders → tableName orders）', () => {
    const meta = {
      name: 'OrderArchive',
      targetName: 'OrderArchive',
      tableName: 'orders',
      deleteDateColumn: { propertyName: 'deletedAt' },
      columns: [{ propertyName: 'title' }],
    };
    const emT = () => ({ connection: { entityMetadatas: [meta] } }) as any;
    expect(resolveLocalEntity(emT(), 'Orders')).toEqual({ name: 'OrderArchive', displayCol: 'title' });
  });

  it('md.name/tableName 均不匹配但 targetName 命中 → 解析（subject 作展示列）', () => {
    const meta = {
      name: 'CustomerEntity',
      targetName: 'CustomerProfile',
      tableName: 'customer_profiles',
      deleteDateColumn: { propertyName: 'deletedAt' },
      columns: [{ propertyName: 'subject' }],
    };
    const emT = () => ({ connection: { entityMetadatas: [meta] } }) as any;
    expect(resolveLocalEntity(emT(), 'CustomerProfile')).toEqual({ name: 'CustomerEntity', displayCol: 'subject' });
  });

  // 多字（snake_case）模块名：resultType=followup_plan 保留下划线，实体类名 FollowupPlan 吞掉下划线、表名复数，
  // 精确比对三者都不相等——必须靠「去下划线」归一兜住，否则生成模块撤销失败（落外部分支 revoke_failed）
  it('多字模块名：type=followup_plan 命中 FollowupPlan（精确比对不漏）', () => {
    const meta = {
      name: 'FollowupPlan',
      targetName: 'FollowupPlan',
      tableName: 'followup_plans',
      deleteDateColumn: { propertyName: 'deletedAt' },
      columns: [{ propertyName: 'title' }],
    };
    const emT = () => ({ connection: { entityMetadatas: [meta] } }) as any;
    expect(resolveLocalEntity(emT(), 'followup_plan')).toEqual({ name: 'FollowupPlan', displayCol: 'title' });
  });

  it('归一同名歧义（FooBar 与 Foobar）→ 多命中不猜，fail-closed 返回 null（绝不误删别的记录）', () => {
    const mk = (name: string, table: string) => ({
      name,
      targetName: name,
      tableName: table,
      deleteDateColumn: { propertyName: 'deletedAt' },
      columns: [{ propertyName: 'title' }],
    });
    const emT = () =>
      ({ connection: { entityMetadatas: [mk('FooBar', 'foo_bars'), mk('Foobar', 'foobars')] } }) as any;
    expect(resolveLocalEntity(emT(), 'foo_bar')).toBeNull();
  });

  it('精确命中优先于归一命中（不让归一改写既有解析）', () => {
    const normalizedOnly = {
      name: 'FollowupPlan',
      targetName: 'FollowupPlan',
      tableName: 'followup_plans',
      deleteDateColumn: { propertyName: 'deletedAt' },
      columns: [{ propertyName: 'name' }],
    };
    const exact = {
      name: 'FollowupPlanDraft',
      targetName: 'FollowupPlanDraft',
      tableName: 'followup_plan',
      deleteDateColumn: { propertyName: 'deletedAt' },
      columns: [{ propertyName: 'title' }],
    };
    const emT = () => ({ connection: { entityMetadatas: [normalizedOnly, exact] } }) as any;
    expect(resolveLocalEntity(emT(), 'followup_plan')).toEqual({ name: 'FollowupPlanDraft', displayCol: 'title' });
  });

  it('前序元数据不命中 → continue 继续扫描，命中后续带软删列的元数据', () => {
    const noMatch = {
      name: 'Invoice',
      targetName: 'Invoice',
      tableName: 'invoices',
      deleteDateColumn: null,
      columns: [],
    };
    const later = {
      name: 'InvoiceDraft',
      targetName: 'InvoiceDraft',
      tableName: 'invoice_drafts',
      deleteDateColumn: { propertyName: 'deletedAt' },
      columns: [{ propertyName: 'title' }],
    };
    const emT = () => ({ connection: { entityMetadatas: [noMatch, later] } }) as any;
    expect(resolveLocalEntity(emT(), 'invoice_drafts')).toEqual({ name: 'InvoiceDraft', displayCol: 'title' });
  });
});

describe('LocalEntityRevoker（#4 生成模块撤销）', () => {
  const invoiceMeta = {
    name: 'Invoice',
    targetName: 'Invoice',
    tableName: 'invoices',
    deleteDateColumn: { propertyName: 'deletedAt' },
    columns: [{ propertyName: 'invoiceNo' }],
  };
  function makeRevoker(repo: Record<string, jest.Mock>) {
    const em = {
      connection: { entityMetadatas: [invoiceMeta] },
      getRepository: jest.fn().mockReturnValue(repo),
    };
    return { revoker: new LocalEntityRevoker(em as any), em };
  }
  function makeRevokerWith(meta: Record<string, unknown>, repo: Record<string, jest.Mock>) {
    const em = {
      connection: { entityMetadatas: [meta] },
      getRepository: jest.fn().mockReturnValue(repo),
    };
    return { revoker: new LocalEntityRevoker(em as any), em };
  }
  const orderMeta = {
    name: 'Order',
    targetName: 'Order',
    tableName: 'orders',
    deleteDateColumn: { propertyName: 'deletedAt' },
    columns: [{ propertyName: 'orderNo' }, { propertyName: 'title' }],
  };

  it('canHandle(invoice)=true（元数据解析）；proxy_call/未知=false', async () => {
    const { revoker } = makeRevoker({ findOne: jest.fn() });
    expect(revoker.canHandle('invoice')).toBe(true);
    expect(revoker.canHandle('proxy_call')).toBe(false);
    expect(revoker.canHandle('unknown_type')).toBe(false);
  });

  it('canHandle 多字模块名（followup_plan）→ true，且 revoke 软删该行', async () => {
    const meta = {
      name: 'FollowupPlan',
      targetName: 'FollowupPlan',
      tableName: 'followup_plans',
      deleteDateColumn: { propertyName: 'deletedAt' },
      columns: [{ propertyName: 'title' }],
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 5, title: '跟进 Acme 客户' }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const { revoker, em } = makeRevokerWith(meta, repo);
    expect(revoker.canHandle('followup_plan')).toBe(true);
    expect(await revoker.revoke('followup_plan', 5, '1')).toEqual({ revoked: true });
    expect(em.getRepository).toHaveBeenCalledWith('FollowupPlan');
    expect(repo.softDelete).toHaveBeenCalledWith(5);
  });

  it('revoke(invoice, id) 软删该行（不是 todo）', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 7, invoiceNo: 'INV-001' }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const { revoker, em } = makeRevoker(repo);
    const out = await revoker.revoke('invoice', 7, '1');
    expect(out.revoked).toBe(true);
    expect(em.getRepository).toHaveBeenCalledWith('Invoice');
    expect(repo.softDelete).toHaveBeenCalledWith(7);
  });

  it('describeTarget(invoice) 不强取 title 列，安全返回 deletedAt', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 7, deletedAt: null }),
    };
    const { revoker } = makeRevoker(repo);
    const out = await revoker.describeTarget('invoice', 7);
    expect(out).toEqual({ title: undefined, deletedAt: null });
  });

  it('describeTarget 未知类型 → 外部系统写调用语义', async () => {
    const repo = { findOne: jest.fn() };
    const { revoker } = makeRevoker(repo);
    const out = await revoker.describeTarget('proxy_call', 0);
    expect(out).toEqual({ title: '外部系统写调用（B 路径）', deletedAt: null });
  });

  it('revoke 无本地实体（proxy_call）→ { revoked:false, message }，不查库不软删', async () => {
    const repo = { findOne: jest.fn(), softDelete: jest.fn() };
    const { revoker, em } = makeRevoker(repo);
    const out = await revoker.revoke('proxy_call', 1, '1');
    expect(out).toEqual({ revoked: false, message: '无本地实体可软删' });
    expect(em.getRepository).not.toHaveBeenCalled();
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('revoke 目标行不存在（已被删/并发删）→ 跳过 softDelete，仍报 revoked', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      softDelete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const { revoker } = makeRevoker(repo);
    expect(await revoker.revoke('invoice', 404, '1')).toEqual({ revoked: true });
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('describeTarget 目标行不存在 → null', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    const { revoker } = makeRevoker(repo);
    expect(await revoker.describeTarget('invoice', 404)).toBeNull();
  });

  it('describeTarget 有展示列：select 带 title + withDeleted，返回 title 文本与 deletedAt', async () => {
    const deletedAt = new Date('2026-09-01T00:00:00Z');
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 9, title: '合同续签单', deletedAt }),
    };
    const { revoker, em } = makeRevokerWith(orderMeta, repo);
    const out = await revoker.describeTarget('order', 9);
    expect(out).toEqual({ title: '合同续签单', deletedAt });
    expect(em.getRepository).toHaveBeenCalledWith('Order');
    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9 },
        withDeleted: true,
        select: { id: true, deletedAt: true, title: true },
      }),
    );
  });

  it('describeTarget 有展示列但值为 null → title undefined（不强取，防生成模块缺值）', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 9, title: null, deletedAt: null }),
    };
    const { revoker } = makeRevokerWith(orderMeta, repo);
    expect(await revoker.describeTarget('order', 9)).toEqual({ title: undefined, deletedAt: null });
  });
});
