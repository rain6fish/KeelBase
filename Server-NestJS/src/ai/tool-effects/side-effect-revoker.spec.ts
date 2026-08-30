/**
 * SideEffectRevoker 工具函数测试
 *
 * 覆盖 entityFor 的 resultType → 本地业务实体映射（撤销/快照目标解析）。
 */

import { entityFor } from './side-effect-revoker';

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
