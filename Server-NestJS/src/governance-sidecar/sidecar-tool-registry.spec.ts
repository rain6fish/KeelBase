// SPDX-License-Identifier: Apache-2.0

import { SidecarToolRegistry } from './sidecar-tool-registry';

describe('SidecarToolRegistry（S-2 门控决策）', () => {
  const defs = [
    { name: 'delete_customer', riskLevel: 'R5' },
    { name: 'create_customer', riskLevel: 'R3' },
    { name: 'review_approval_request', riskLevel: 'R4' },
    { name: 'query_customers', riskLevel: 'R1' },
  ];

  it('声明风险级：R5→block / R3·R4→confirm / R0-R2→auto', () => {
    const r = new SidecarToolRegistry(defs);
    expect(r.decide('delete_customer').decision).toBe('block');
    expect(r.decide('create_customer').decision).toBe('confirm');
    expect(r.decide('review_approval_request').decision).toBe('confirm');
    expect(r.decide('query_customers').decision).toBe('auto');
  });

  it('策略 enabled=false → block', () => {
    const r = new SidecarToolRegistry(defs);
    r.setPolicy({ tools: { create_customer: { enabled: false } } });
    expect(r.decide('create_customer')).toMatchObject({ decision: 'block' });
  });

  it('策略 mode=confirm·approval 强制确认；mode=auto 放宽 R3（§22.15(4)）', () => {
    const r = new SidecarToolRegistry(defs);
    r.setPolicy({
      tools: {
        query_customers: { mode: 'confirm' },
        create_customer: { mode: 'auto' },
        review_approval_request: { mode: 'approval' },
      },
    });
    expect(r.decide('query_customers').decision).toBe('confirm');
    expect(r.decide('create_customer').decision).toBe('auto');
    expect(r.decide('review_approval_request').decision).toBe('confirm');
  });

  it('legacy requiresConfirmation 布尔覆盖仍生效（true 强制 / false 放宽）', () => {
    const r = new SidecarToolRegistry(defs);
    r.setPolicy({
      tools: {
        query_customers: { requiresConfirmation: true },
        create_customer: { requiresConfirmation: false },
      },
    });
    expect(r.decide('query_customers').decision).toBe('confirm');
    expect(r.decide('create_customer').decision).toBe('auto');
  });
});
