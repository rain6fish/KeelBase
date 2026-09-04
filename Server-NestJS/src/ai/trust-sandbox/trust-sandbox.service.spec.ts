// SPDX-License-Identifier: Apache-2.0

/**
 * Trust 沙盘（TrustSandboxService）单元测试
 *
 * 覆盖六场景的确定性返回结构：s1 正常分析 / s2 越权拒绝 / s3 R5 阻断 /
 * s4 确认门控 / s5 撤销 / s6 Java 引导 / 未知场景。
 */

import { ForbiddenException } from '@nestjs/common';
import { TrustSandboxService } from './trust-sandbox.service';

describe('TrustSandboxService', () => {
  let sandbox: TrustSandboxService;
  let aiService: {
    chat: jest.Mock;
    executeToolForExternal: jest.Mock;
  };
  let crmService: {
    createCustomer: jest.Mock;
    createOrder: jest.Mock;
    getCustomer360Data: jest.Mock;
  };
  let usersService: { create: jest.Mock };
  let effectsService: {
    listOwned: jest.Mock;
    revokeOwned: jest.Mock;
  };

  beforeEach(() => {
    aiService = {
      chat: jest.fn(),
      executeToolForExternal: jest.fn(),
    };
    crmService = {
      createCustomer: jest.fn(),
      createOrder: jest.fn(),
      getCustomer360Data: jest.fn(),
    };
    usersService = { create: jest.fn() };
    effectsService = {
      listOwned: jest.fn(),
      revokeOwned: jest.fn(),
    };
    sandbox = new TrustSandboxService(
      aiService as never,
      crmService as never,
      usersService as never,
      effectsService as never,
    );
  });

  it('scenarios 暴露六场景清单', () => {
    expect(sandbox.scenarios.map((s) => s.id)).toEqual([
      's1_normal', 's2_denied', 's3_r5_block', 's4_confirm', 's5_revoke', 's6_java',
    ]);
  });

  it('s1_normal：建客户+逾期订单 → AI 风险分析 critical → passed + conversationId', async () => {
    crmService.createCustomer.mockResolvedValue({ id: 9, name: '沙盘客户123' });
    crmService.createOrder.mockResolvedValue({});
    aiService.chat.mockResolvedValue({
      conversationId: 'conv-1',
      reply: '风险分析完成：风险等级：critical（评分 12）…',
    });
    const r = await sandbox.run('s1_normal', '42');
    expect(r.outcome).toBe('passed');
    expect(r.conversationId).toBe('conv-1');
    expect(r.resultType).toBe('crm_customer');
    expect(crmService.createOrder).toHaveBeenCalledTimes(2);
  });

  it('s2_denied：bob 越权读当前用户客户被拒 → denied', async () => {
    crmService.createCustomer.mockResolvedValue({ id: 9, name: '越权目标' });
    usersService.create.mockResolvedValue({ id: 77 });
    crmService.getCustomer360Data.mockRejectedValue(new ForbiddenException('无权访问此客户'));
    const r = await sandbox.run('s2_denied', '42');
    expect(r.outcome).toBe('passed');
    expect(String(r.detail)).toContain('被拒');
    expect(usersService.create).toHaveBeenCalled();
  });

  it('s3_r5_block：AI 尝试删除客户 → R5 阻断文本 → passed', async () => {
    aiService.chat.mockResolvedValue({
      conversationId: 'conv-3',
      reply: '已执行 delete_customer：{"success":false,"error":"Tool \\"delete_customer\\" is blocked (risk level R5)"}',
    });
    const r = await sandbox.run('s3_r5_block', '42');
    expect(r.outcome).toBe('passed');
    expect(r.conversationId).toBe('conv-3');
  });

  it('s4_confirm：写工具确认门控触发 → passed', async () => {
    aiService.executeToolForExternal.mockResolvedValue({ executed: false, requiresConfirmation: true });
    const r = await sandbox.run('s4_confirm', '42');
    expect(r.outcome).toBe('passed');
    expect(r.requiresConfirmation).toBe(true);
  });

  it('s5_revoke：本人有可撤销副作用 → 撤销 passed；无则 guide', async () => {
    effectsService.listOwned.mockResolvedValue({ items: [{ id: 5, resultType: 'crm_task' }] });
    effectsService.revokeOwned.mockResolvedValue({ revoked: true, effectId: 5 });
    const r = await sandbox.run('s5_revoke', '42');
    expect(r.outcome).toBe('passed');
    expect(r.effectId).toBe(5);
    expect(effectsService.revokeOwned).toHaveBeenCalledWith(5, '42');

    effectsService.listOwned.mockResolvedValue({ items: [] });
    const r2 = await sandbox.run('s5_revoke', '43');
    expect(r2.outcome).toBe('guide');
  });

  it('s6_java：返回 Java 引导', async () => {
    const r = await sandbox.run('s6_java', '42');
    expect(r.outcome).toBe('guide');
    expect(String(r.detail)).toContain('java-starter');
  });

  it('未知场景 → unknown', async () => {
    const r = await sandbox.run('sx_unknown', '42');
    expect(r.outcome).toBe('unknown');
  });
});
