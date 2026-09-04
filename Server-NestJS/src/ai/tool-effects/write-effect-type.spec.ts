// SPDX-License-Identifier: Apache-2.0

/**
 * writeEffectTypeFor：#4 写工具 → 副作用 resultType 推导。
 * 旗舰 create_* 走显式别名；生成模块 create_<module> 由工具名推导；非 create 且无别名 → null（fail-closed，不记副作用）。
 */

import { writeEffectTypeFor } from './write-effect-type';

describe('writeEffectTypeFor', () => {
  it('旗舰别名稳定', () => {
    expect(writeEffectTypeFor('create_event')).toBe('event');
    expect(writeEffectTypeFor('create_todo')).toBe('todo');
    expect(writeEffectTypeFor('create_followup_task')).toBe('crm_task');
    expect(writeEffectTypeFor('create_project_task')).toBe('pm_task');
    expect(writeEffectTypeFor('submit_approval_request')).toBe('app_request');
    expect(writeEffectTypeFor('create_contract')).toBe('contract');
  });

  it('#4 生成模块 create_invoice → invoice（不再兜底 todo）', () => {
    expect(writeEffectTypeFor('create_invoice')).toBe('invoice');
    expect(writeEffectTypeFor('create_book')).toBe('book');
    expect(writeEffectTypeFor('create_supplier')).toBe('supplier');
  });

  it('读/分析工具或非 create → null（不登记副作用，fail-closed）', () => {
    expect(writeEffectTypeFor('query_events')).toBeNull();
    expect(writeEffectTypeFor('analyze_customer_risk')).toBeNull();
    expect(writeEffectTypeFor('navigate_page')).toBeNull();
  });
});
