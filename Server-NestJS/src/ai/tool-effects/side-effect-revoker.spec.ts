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

  it('canHandle(invoice)=true（元数据解析）；proxy_call/未知=false', async () => {
    const { revoker } = makeRevoker({ findOne: jest.fn() });
    expect(revoker.canHandle('invoice')).toBe(true);
    expect(revoker.canHandle('proxy_call')).toBe(false);
    expect(revoker.canHandle('unknown_type')).toBe(false);
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
});
