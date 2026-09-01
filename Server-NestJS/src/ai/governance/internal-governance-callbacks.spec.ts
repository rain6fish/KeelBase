// SPDX-License-Identifier: Apache-2.0

/**
 * Internal governance callbacks（D2-4 跨服务回调端点）单元测试
 *
 * 覆盖：InternalApprovalsController.execute（审批执行回调）+ InternalEffectsController.revoke（撤销回调）
 * 的入参透传 / 默认值 / 非法 effectId 404 / 记录不存在 404。
 */

import { NotFoundException } from '@nestjs/common';
import { InternalApprovalsController } from './internal-approvals.controller';
import { InternalEffectsController } from './internal-effects.controller';

describe('Internal governance callbacks（D2-4 跨服务回调端点）', () => {
  describe('InternalApprovalsController', () => {
    it('execute 调 decideApproval（approve 决策透传）', async () => {
      const aiService = { decideApproval: jest.fn().mockResolvedValue({ ok: true }) };
      const ctrl = new InternalApprovalsController(aiService as any);
      const out = await ctrl.execute('tok-1', { approverId: '42', decision: 'approve' });
      expect(aiService.decideApproval).toHaveBeenCalledWith('tok-1', '42', 'approve');
      expect(out).toEqual({ ok: true });
    });

    it('缺省 approverId 回退 governance、decision 回退 approve', async () => {
      const aiService = { decideApproval: jest.fn().mockResolvedValue({ ok: true }) };
      const ctrl = new InternalApprovalsController(aiService as any);
      await ctrl.execute('tok-2', undefined);
      expect(aiService.decideApproval).toHaveBeenCalledWith('tok-2', 'governance', 'approve');
    });
  });

  describe('InternalEffectsController', () => {
    it('revoke 调 toolEffects.revoke(effectId) 并返回结果', async () => {
      const toolEffects = { revoke: jest.fn().mockResolvedValue({ revoked: true, effectId: 7 }) };
      const ctrl = new InternalEffectsController(toolEffects as any);
      const out = await ctrl.revoke({ effectId: 7 });
      expect(toolEffects.revoke).toHaveBeenCalledWith(7);
      expect(out).toEqual({ revoked: true, effectId: 7 });
    });

    it('effectId 缺失或非法 → 404', async () => {
      const ctrl = new InternalEffectsController({ revoke: jest.fn() } as any);
      await expect(ctrl.revoke({})).rejects.toThrow(NotFoundException);
      await expect(ctrl.revoke({ effectId: -1 })).rejects.toThrow(NotFoundException);
    });

    it('副作用记录不存在 → 404', async () => {
      const ctrl = new InternalEffectsController({ revoke: jest.fn().mockResolvedValue(null) } as any);
      await expect(ctrl.revoke({ effectId: 999 })).rejects.toThrow(NotFoundException);
    });
  });
});
