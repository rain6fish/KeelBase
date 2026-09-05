// SPDX-License-Identifier: Apache-2.0

import { NotFoundException } from '@nestjs/common';
import { ExternalEffectsController } from './external-effects.controller';

describe('ExternalEffectsController（服务身份查 AI 副作用状态）', () => {
  let mockEffects: { findByTarget: jest.Mock; describeTarget: jest.Mock };
  let controller: ExternalEffectsController;

  const localEffect = {
    id: 21, toolName: 'create_followup_task', userId: 3, conversationId: 'conv-1',
    resultType: 'crm_task', resultId: 42, createdAt: new Date('2026-09-01T00:00:00Z'),
  };
  const proxyEffect = {
    id: 9, toolName: 'proxy_create_followup', userId: 3, conversationId: null,
    resultType: 'proxy_call', resultId: 7, createdAt: new Date('2026-09-01T00:00:00Z'),
  };

  beforeEach(() => {
    mockEffects = {
      findByTarget: jest.fn(),
      describeTarget: jest.fn(),
    };
    controller = new ExternalEffectsController(mockEffects as any);
  });

  it('本地实体副作用：返回 effect + target + revoked（软删即撤销）', async () => {
    mockEffects.findByTarget.mockResolvedValue(localEffect);
    mockEffects.describeTarget.mockResolvedValue({
      targetExists: true, targetSoftDeleted: false, targetTitle: '跟进任务 A',
    });
    const res = await controller.status('crm_task', '42');
    expect(res['effect'].resultType).toBe('crm_task');
    expect(res['target'].targetExists).toBe(true);
    expect(res['revoked']).toBe(false);
    expect(res['revokeHint']).toBeUndefined();
  });

  it('本地实体已软删 → revoked=true', async () => {
    mockEffects.findByTarget.mockResolvedValue(localEffect);
    mockEffects.describeTarget.mockResolvedValue({
      targetExists: false, targetSoftDeleted: true, targetTitle: null,
    });
    const res = await controller.status('crm_task', '42');
    expect(res['revoked']).toBe(true);
  });

  it('B 路径 proxy_call：诚实 revokeHint（主库无撤销列，撤销态在 Java 侧）', async () => {
    mockEffects.findByTarget.mockResolvedValue(proxyEffect);
    mockEffects.describeTarget.mockResolvedValue({
      targetExists: false, targetSoftDeleted: false, targetTitle: null,
    });
    const res = await controller.status('proxy_call', '7');
    expect(res['effect'].resultType).toBe('proxy_call');
    expect(res['revokeHint']).toMatch(/Java/);
  });

  it('无副作用记录 → 404', async () => {
    mockEffects.findByTarget.mockResolvedValue(null);
    await expect(controller.status('followup', '99')).rejects.toThrow(NotFoundException);
  });

  it('resultId 非法（非正整数）→ 404', async () => {
    await expect(controller.status('followup', 'abc')).rejects.toThrow(NotFoundException);
    await expect(controller.status('followup', '0')).rejects.toThrow(NotFoundException);
    expect(mockEffects.findByTarget).not.toHaveBeenCalled();
  });
});
