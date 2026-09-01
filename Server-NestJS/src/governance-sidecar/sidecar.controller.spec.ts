// SPDX-License-Identifier: Apache-2.0

import { SidecarController } from './sidecar.controller';
import { SidecarService } from './sidecar.service';

describe('SidecarController（/v1 端点接线）', () => {
  let controller: SidecarController;
  let service: {
    proxyChat: jest.Mock;
    confirm: jest.Mock;
    pendingConfirmations: jest.Mock;
    applyPushedPolicy: jest.Mock;
  };

  beforeEach(() => {
    service = {
      proxyChat: jest.fn().mockResolvedValue({ id: 'chatcmpl-1' }),
      confirm: jest.fn().mockReturnValue({ id: 'approved' }),
      pendingConfirmations: jest.fn().mockReturnValue([{ token: 'tok', tools: ['send_email'], expiresAt: 1 }]),
      applyPushedPolicy: jest.fn().mockReturnValue({ accepted: true, pushedAt: '2026-09-01T00:00:00Z' }),
    };
    controller = new SidecarController(service as unknown as SidecarService);
  });

  it('GET /v1/health → 健康状态（docker healthcheck 用）', async () => {
    await expect(controller.health()).resolves.toEqual({ ok: true, service: 'sidecar' });
  });

  it('POST /v1/chat/completions 透传 body + x-user-id', async () => {
    await controller.chatCompletions({ model: 'mock' } as never, 'ops-bot');
    expect(service.proxyChat).toHaveBeenCalledWith({ model: 'mock' }, 'ops-bot');
  });

  it('POST /v1/confirmations/:token 透传决策', async () => {
    const out = await controller.confirm('tok', { decision: 'approve' }, 'ops-bot');
    expect(service.confirm).toHaveBeenCalledWith('tok', 'approve', 'ops-bot');
    expect(out).toEqual({ id: 'approved' });
  });

  it('POST /v1/confirmations 列待确认项（需共享服务密钥）', async () => {
    const orig = process.env.GOVERNANCE_API_KEY;
    process.env.GOVERNANCE_API_KEY = 'test-key';
    try {
      await expect(controller.pending('test-key')).resolves.toEqual({
        pending: [{ token: 'tok', tools: ['send_email'], expiresAt: 1 }],
      });
      // 无 key / 错误 key → 401（防内网枚举 token）
      await expect(controller.pending(undefined)).rejects.toThrow();
      await expect(controller.pending('wrong')).rejects.toThrow();
    } finally {
      process.env.GOVERNANCE_API_KEY = orig;
    }
  });

  it('B2 POST /v1/policy 透传策略推送（需共享服务密钥）', async () => {
    const orig = process.env.GOVERNANCE_API_KEY;
    process.env.GOVERNANCE_API_KEY = 'test-key';
    try {
      const policy = { tools: { send_email: { enabled: false } } };
      await expect(controller.policy({ policy, pushedAt: '2026-09-01T00:00:00Z' }, 'test-key')).resolves.toEqual({
        accepted: true,
        pushedAt: '2026-09-01T00:00:00Z',
      });
      expect(service.applyPushedPolicy).toHaveBeenCalledWith(policy, '2026-09-01T00:00:00Z');
      // 无 key / 错误 key → 401（防未授权篡改策略）
      await expect(controller.policy({ policy }, undefined)).rejects.toThrow();
      await expect(controller.policy({ policy }, 'wrong')).rejects.toThrow();
    } finally {
      process.env.GOVERNANCE_API_KEY = orig;
    }
  });
});
