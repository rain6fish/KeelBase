// SPDX-License-Identifier: Apache-2.0

/**
 * §22.17 ④ 影响预览推导（spec docs/impact-preview.spec.md §3/§6）。
 * 覆盖：单条 / run 分组求和 / 生成模块 create_<module> 推导 / proxy → proxy_call /
 * 无法解析对象者不计入且整体为 null（调用方省略字段，不发 0）。
 */
import { deriveWriteImpact } from './write-impact';

const ref = (toolName: string, isProxyWrite = false) => ({ toolName, isProxyWrite });

describe('deriveWriteImpact（确认卡影响预览）', () => {
  it('单条写工具 → 1 个动作、1 类对象', () => {
    expect(deriveWriteImpact([ref('create_followup_task')])).toEqual({
      actions: 1,
      targets: [{ resultType: 'crm_task', count: 1 }],
    });
  });

  it('run：按对象类型分组求和，actions = 各 count 之和', () => {
    const impact = deriveWriteImpact([
      ref('create_followup_task'),
      ref('create_followup_task'),
      ref('create_contract'),
    ]);
    expect(impact).toEqual({
      actions: 3,
      targets: [
        { resultType: 'crm_task', count: 2 },
        { resultType: 'contract', count: 1 },
      ],
    });
  });

  it('生成模块 create_<module> 由工具名推导对象类型（与副作用登记同源）', () => {
    expect(deriveWriteImpact([ref('create_invoices')])).toEqual({
      actions: 1,
      targets: [{ resultType: 'invoices', count: 1 }],
    });
  });

  it('B 路径代理写 → proxy_call（与副作用登记同判据）', () => {
    expect(deriveWriteImpact([ref('proxy_legacy_erp', true)])).toEqual({
      actions: 1,
      targets: [{ resultType: 'proxy_call', count: 1 }],
    });
  });

  it('无法解析副作用对象的工具不计入（fail-closed：不编数字）', () => {
    // review_approval_request 是状态变更型写工具，不登记可撤副作用
    expect(deriveWriteImpact([ref('review_approval_request')])).toBeNull();
    // run 内混入不可解析者 → 只统计可解析的
    expect(deriveWriteImpact([ref('review_approval_request'), ref('create_todo')])).toEqual({
      actions: 1,
      targets: [{ resultType: 'todo', count: 1 }],
    });
  });

  it('空输入 → null（调用方据此省略 impact，而非发 0 个动作）', () => {
    expect(deriveWriteImpact([])).toBeNull();
  });
});
