// SPDX-License-Identifier: Apache-2.0

import { BadRequestException } from '@nestjs/common';
import { GovernanceController } from './governance.controller';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';
import { GovernanceApprovalService } from './governance-approval.service';
import { SidecarRegistryService } from './sidecar-registry.service';

describe('GovernanceController（D2-2 治理台 / B2 策略推送）', () => {
  let controller: GovernanceController;
  let approvals: { listPendingApprovals: jest.Mock; listDecidedApprovals: jest.Mock };
  let policy: { getPolicy: jest.Mock; getPresets: jest.Mock; applyPreset: jest.Mock };
  let toolEffects: { list: jest.Mock; revoke: jest.Mock; record: jest.Mock };
  let sidecars: { pushPolicy: jest.Mock; register: jest.Mock; list: jest.Mock };

  const originalTarget = process.env.GOVERNANCE_TARGET_URL;
  const originalApiKey = process.env.GOVERNANCE_API_KEY;

  beforeEach(() => {
    approvals = {
      listPendingApprovals: jest.fn().mockResolvedValue([{ token: 'p1' }]),
      listDecidedApprovals: jest.fn().mockResolvedValue([{ token: 'd1', status: 'approved' }]),
    };
    policy = {
      getPolicy: jest.fn().mockResolvedValue({ tools: { send_email: { enabled: false } } }),
      getPresets: jest.fn().mockReturnValue([{ id: 'financial', name: '金融' }]),
      applyPreset: jest.fn().mockResolvedValue({ tools: { send_email: { enabled: false } } }),
    };
    toolEffects = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      revoke: jest.fn().mockResolvedValue({ status: 'revoked', effectId: 9 }),
      record: jest.fn().mockResolvedValue({ id: 5 }),
    };
    sidecars = {
      pushPolicy: jest.fn().mockResolvedValue({ pushed: 1, failed: 0 }),
      register: jest.fn(),
      list: jest.fn(),
    };
    controller = new GovernanceController(
      approvals as unknown as GovernanceApprovalService,
      policy as unknown as GovernancePolicyService,
      toolEffects as unknown as AiToolEffectsService,
      sidecars as unknown as SidecarRegistryService,
    );
  });

  afterAll(() => {
    if (originalTarget === undefined) delete process.env.GOVERNANCE_TARGET_URL;
    else process.env.GOVERNANCE_TARGET_URL = originalTarget;
    if (originalApiKey === undefined) delete process.env.GOVERNANCE_API_KEY;
    else process.env.GOVERNANCE_API_KEY = originalApiKey;
  });

  it('health：返回治理台服务标识', async () => {
    await expect(controller.health()).resolves.toEqual({ ok: true, service: 'governance' });
  });

  it('listPending：无 limit → 默认 50', async () => {
    const out = await controller.listPending(undefined);
    expect(approvals.listPendingApprovals).toHaveBeenCalledWith(50);
    expect(out).toEqual([{ token: 'p1' }]);
  });

  it('listPending：limit 超过上限被截断为 100', async () => {
    await controller.listPending('150');
    expect(approvals.listPendingApprovals).toHaveBeenCalledWith(100);
  });

  it('listPending：非法 limit → 回退 50', async () => {
    await controller.listPending('abc');
    expect(approvals.listPendingApprovals).toHaveBeenCalledWith(50);
  });

  it('listDecided：无 limit → 默认 50', async () => {
    const out = await controller.listDecided(undefined);
    expect(approvals.listDecidedApprovals).toHaveBeenCalledWith(50);
    expect(out).toEqual([{ token: 'd1', status: 'approved' }]);
  });

  it('getPolicy：委托治理策略服务', async () => {
    const out = await controller.getPolicy();
    expect(policy.getPolicy).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ tools: { send_email: { enabled: false } } });
  });

  it('getPolicyPresets：返回策略模板库', async () => {
    const out = await controller.getPolicyPresets();
    expect(policy.getPresets).toHaveBeenCalledTimes(1);
    expect(out).toEqual([{ id: 'financial', name: '金融' }]);
  });

  it('listEffects：缺省参数映射为 undefined 分页默认值', async () => {
    const out = await controller.listEffects(undefined, undefined, undefined);
    expect(toolEffects.list).toHaveBeenCalledWith({ userId: undefined, page: 1, limit: 20 });
    expect(out).toEqual({ items: [], total: 0 });
  });

  it('listEffects：userId/page/limit 数字转换', async () => {
    await controller.listEffects('42', '2', '50');
    expect(toolEffects.list).toHaveBeenCalledWith({ userId: 42, page: 2, limit: 50 });
  });

  it('B2 apply-preset：策略应用后向已注册 sidecar 实时推送', async () => {
    const out = await controller.applyPolicyPreset('financial');
    expect(out).toEqual({ tools: { send_email: { enabled: false } } });
    expect(sidecars.pushPolicy).toHaveBeenCalledWith({ tools: { send_email: { enabled: false } } });
  });

  describe('approveBy（D2-4 approve 回调执行）', () => {
    it('未配置 GOVERNANCE_TARGET_URL → BadRequest', async () => {
      const prev = process.env.GOVERNANCE_TARGET_URL;
      delete process.env.GOVERNANCE_TARGET_URL;
      try {
        await expect(controller.approveBy('tok-1', { decision: 'approve' })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      } finally {
        process.env.GOVERNANCE_TARGET_URL = prev;
      }
    });

    it('配置目标 → POST 业务系统审批执行端点并返回结果', async () => {
      process.env.GOVERNANCE_TARGET_URL = 'http://biz:3000';
      process.env.GOVERNANCE_API_KEY = 'gov-key';
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ decision: 'approve', executed: true }) } as unknown as Response);
      try {
        const out = await controller.approveBy('tok-1', { decision: 'approve' });
        expect(fetchMock).toHaveBeenCalledWith(
          'http://biz:3000/api/v1/internal/approvals/tok-1/execute',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': 'gov-key' },
            body: JSON.stringify({ decision: 'approve', approverId: 'governance' }),
          }),
        );
        expect(out).toEqual({ decision: 'approve', executed: true });
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('dto 缺省 → decision 默认 approve', async () => {
      process.env.GOVERNANCE_TARGET_URL = 'http://biz:3000';
      process.env.GOVERNANCE_API_KEY = 'gov-key';
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ decision: 'approve' }) } as unknown as Response);
      try {
        await controller.approveBy('tok-2');
        const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string })?.body);
        expect(body.decision).toBe('approve');
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('dto.decision=decline → body 带 decline', async () => {
      process.env.GOVERNANCE_TARGET_URL = 'http://biz:3000';
      process.env.GOVERNANCE_API_KEY = 'gov-key';
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ decision: 'decline' }) } as unknown as Response);
      try {
        await controller.approveBy('tok-3', { decision: 'decline' });
        const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string })?.body);
        expect(body.decision).toBe('decline');
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('token 含特殊字符 → encodeURIComponent', async () => {
      process.env.GOVERNANCE_TARGET_URL = 'http://biz:3000';
      process.env.GOVERNANCE_API_KEY = 'gov-key';
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ decision: 'approve' }) } as unknown as Response);
      try {
        await controller.approveBy('a/b c');
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
          'http://biz:3000/api/v1/internal/approvals/a%2Fb%20c/execute',
        );
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('业务系统返回 !ok → BadRequest', async () => {
      process.env.GOVERNANCE_TARGET_URL = 'http://biz:3000';
      process.env.GOVERNANCE_API_KEY = 'gov-key';
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
      try {
        await expect(controller.approveBy('tok-4', { decision: 'approve' })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      } finally {
        fetchMock.mockRestore();
      }
    });
  });

  describe('revokeEffect（D2-4 副作用撤销）', () => {
    it('未配置目标 → 本地 revoker 撤销', async () => {
      const prev = process.env.GOVERNANCE_TARGET_URL;
      delete process.env.GOVERNANCE_TARGET_URL;
      try {
        const out = await controller.revokeEffect(42);
        expect(toolEffects.revoke).toHaveBeenCalledWith(42);
        expect(out).toEqual({ status: 'revoked', effectId: 9 });
      } finally {
        process.env.GOVERNANCE_TARGET_URL = prev;
      }
    });

    it('配置目标且回调 ok → 返回回调结果，不调本地 revoke', async () => {
      process.env.GOVERNANCE_TARGET_URL = 'http://biz:3000';
      process.env.GOVERNANCE_API_KEY = 'gov-key';
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ revoked: true, effectId: 42 }) } as unknown as Response);
      try {
        const out = await controller.revokeEffect(42);
        expect(fetchMock).toHaveBeenCalledWith(
          'http://biz:3000/api/v1/internal/effects/revoke',
          expect.objectContaining({ body: JSON.stringify({ effectId: 42 }) }),
        );
        expect(toolEffects.revoke).not.toHaveBeenCalled();
        expect(out).toEqual({ revoked: true, effectId: 42 });
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('回调抛异常 → 回退本地 revoker', async () => {
      process.env.GOVERNANCE_TARGET_URL = 'http://biz:3000';
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('network down'));
      try {
        const out = await controller.revokeEffect(7);
        expect(toolEffects.revoke).toHaveBeenCalledWith(7);
        expect(out).toEqual({ status: 'revoked', effectId: 9 });
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('回调返回 !ok → 回退本地 revoker', async () => {
      process.env.GOVERNANCE_TARGET_URL = 'http://biz:3000';
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: false, status: 400, json: async () => ({}) } as unknown as Response);
      try {
        await controller.revokeEffect(3);
        expect(toolEffects.revoke).toHaveBeenCalledWith(3);
      } finally {
        fetchMock.mockRestore();
      }
    });
  });
});
