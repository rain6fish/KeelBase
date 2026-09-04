// SPDX-License-Identifier: Apache-2.0

import { AuthorizationExplainerService } from './authorization-explainer.service';

/** §22.17③ Policy Evidence：getAuthorizationReasons 单次取策略 → 决策输入 checks + 决策时策略内容指纹 revision 同源 */
describe('AuthorizationExplainerService (§22.17③ Policy Evidence)', () => {
  function build(governancePolicy?: any) {
    const toolRegistry = { riskLevel: jest.fn(() => 'R3') } as any;
    const usersService = { findOne: jest.fn().mockResolvedValue({ role: 'user' }) } as any;
    const service = new AuthorizationExplainerService(toolRegistry, {} as any, governancePolicy, usersService);
    return { service };
  }

  it('单次取策略：checks 按当前 tools 派生，policy = 决策时策略内容指纹 revision + updatedAt', async () => {
    const governancePolicy = {
      getPolicy: jest.fn().mockResolvedValue({
        tools: { create_event: { allowedRoles: ['admin'] } },
        audit: { granularity: 'all' },
        updatedAt: new Date('2026-09-04T09:20:00.000Z'),
        revision: 'a1b2c3d4e5f6',
      }),
    };
    const { service } = build(governancePolicy);

    const res = await service.getAuthorizationReasons('create_event', '7', true);
    expect(res.policy).toEqual({ revision: 'a1b2c3d4e5f6', updatedAt: '2026-09-04T09:20:00.000Z' });
    // role_allowed：策略白名单 ['admin']，用户角色 user → ok:false
    const roleCheck = res.checks.find((c) => c.name === 'role_allowed')!;
    expect(roleCheck.ok).toBe(false);
    const toolEnabled = res.checks.find((c) => c.name === 'tool_enabled')!;
    expect(toolEnabled.ok).toBe(true); // 策略无 enable:false → 默认启用
    expect(governancePolicy.getPolicy).toHaveBeenCalledTimes(1);
  });

  it('策略禁用工具 → tool_enabled ok:false，仍带 policy.revision', async () => {
    const governancePolicy = {
      getPolicy: jest.fn().mockResolvedValue({
        tools: { create_event: { enabled: false } },
        audit: { granularity: 'all' },
        updatedAt: new Date('2026-09-04T10:00:00.000Z'),
        revision: 'f0e1d2c3b4a5',
      }),
    };
    const { service } = build(governancePolicy);
    const res = await service.getAuthorizationReasons('create_event', '7', true);
    const toolEnabled = res.checks.find((c) => c.name === 'tool_enabled')!;
    expect(toolEnabled).toMatchObject({ ok: false, note: '治理策略禁用' });
    expect(res.policy?.revision).toBe('f0e1d2c3b4a5');
  });

  it('无治理策略 → policy 不附（默认策略语义），checks 缺省 governance 项', async () => {
    const { service } = build(undefined);
    const res = await service.getAuthorizationReasons('query_events', '7', false);
    expect(res.policy).toBeUndefined();
    expect(res.checks.map((c) => c.name)).not.toContain('tool_enabled');
    expect(res.checks.map((c) => c.name)).toEqual(['user_scoped', 'risk_policy']);
    expect(res.riskLevel).toBe('R3');
  });
});
