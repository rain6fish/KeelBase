// SPDX-License-Identifier: Apache-2.0

import { ExternalGovernanceController } from './external-governance.controller';
import { AuditService } from '../ai/audit/audit.service';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';
import { SidecarRegistryService } from './sidecar-registry.service';

describe('ExternalGovernanceController（D2-3 业务接入 / B2 sidecar 注册）', () => {
  let controller: ExternalGovernanceController;
  let audit: { log: jest.Mock };
  let policy: { getPolicy: jest.Mock };
  let toolEffects: { record: jest.Mock; list: jest.Mock; revoke: jest.Mock };
  let sidecars: { register: jest.Mock; pushPolicy: jest.Mock; list: jest.Mock };

  beforeEach(() => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    policy = { getPolicy: jest.fn().mockResolvedValue({ tools: { x: { enabled: false } } }) };
    toolEffects = {
      record: jest.fn().mockResolvedValue({ id: 7 }),
      list: jest.fn(),
      revoke: jest.fn(),
    };
    sidecars = {
      register: jest.fn().mockReturnValue({ registered: true, total: 1 }),
      pushPolicy: jest.fn(),
      list: jest.fn(),
    };
    controller = new ExternalGovernanceController(
      audit as unknown as AuditService,
      policy as unknown as GovernancePolicyService,
      toolEffects as unknown as AiToolEffectsService,
      sidecars as unknown as SidecarRegistryService,
    );
  });

  it('B2 registerSidecar：sidecar 启动注册回调地址', async () => {
    const out = await controller.registerSidecar('http://sidecar:3200');
    expect(sidecars.register).toHaveBeenCalledWith('http://sidecar:3200');
    expect(out).toEqual({ registered: true, total: 1 });
  });

  describe('reportAudit（业务系统上报 AI 审计）', () => {
    it('完整字段按规则映射后调用 audit.log，返回 ok', async () => {
      const dto = {
        action: 'tool_call',
        userId: 42,
        username: 'alice',
        conversationId: 'conv-1',
        detail: 'create event',
        model: 'deepseek',
        provider: 'deepseek',
        agentId: 'agent-1',
        source: 'biz',
        promptTokens: '120',
        completionTokens: 30,
        durationMs: '250',
        isError: 'true',
        errorMessage: 'boom',
        authorization: 'allowed',
      };
      const out = await controller.reportAudit(dto);
      expect(audit.log).toHaveBeenCalledWith({
        userId: '42',
        username: 'alice',
        conversationId: 'conv-1',
        action: 'tool_call',
        detail: 'create event',
        model: 'deepseek',
        provider: 'deepseek',
        agentId: 'agent-1',
        source: 'biz',
        promptTokens: 120,
        completionTokens: 30,
        durationMs: 250,
        isError: true,
        errorMessage: 'boom',
        authorization: 'allowed',
      });
      expect(out).toEqual({ ok: true });
    });

    it('空 dto 缺省值：userId=0 / action=chat / source=external / isError=false', async () => {
      await controller.reportAudit({});
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '0',
          action: 'chat',
          source: 'external',
          isError: false,
          promptTokens: undefined,
          completionTokens: undefined,
          durationMs: undefined,
        }),
      );
    });

    it('isError 布尔 true 与字符串 "true" 均归一为 true', async () => {
      await controller.reportAudit({ isError: true });
      expect(audit.log.mock.calls[0][0].isError).toBe(true);
      await controller.reportAudit({ isError: 'true' });
      expect(audit.log.mock.calls[1][0].isError).toBe(true);
    });
  });

  it('getPolicy：业务系统拉取实时治理策略', async () => {
    const out = await controller.getPolicy();
    expect(policy.getPolicy).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ tools: { x: { enabled: false } } });
  });

  describe('reportEffect（业务系统上报 AI 写副作用）', () => {
    it('完整 dto → toolEffects.record + 回带 effectId', async () => {
      const dto = {
        userId: 42,
        conversationId: 'conv-2',
        toolName: 'create_crm_task',
        args: { title: 't' },
        resultType: 'crm_task',
        resultId: 123,
      };
      const out = await controller.reportEffect(dto);
      expect(toolEffects.record).toHaveBeenCalledWith(
        {
          userId: '42',
          conversationId: 'conv-2',
          toolName: 'create_crm_task',
          args: { title: 't' },
        },
        'crm_task',
        123,
      );
      expect(out).toEqual({ ok: true, effectId: 7 });
    });

    it('缺省 dto：userId=0 / toolName=external / args={} / resultType=external / resultId=0', async () => {
      await controller.reportEffect({});
      expect(toolEffects.record).toHaveBeenCalledWith(
        { userId: '0', conversationId: undefined, toolName: 'external', args: {} },
        'external',
        0,
      );
    });

    it('record 未落库（undefined）→ effectId 缺省', async () => {
      toolEffects.record.mockResolvedValueOnce(undefined);
      const out = await controller.reportEffect({ userId: 1, toolName: 'create_event' });
      expect(out).toEqual({ ok: true, effectId: undefined });
    });
  });
});
