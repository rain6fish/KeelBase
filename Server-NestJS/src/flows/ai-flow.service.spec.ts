// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiFlowService } from './ai-flow.service';
import { LlmProviderFactory } from '../ai/providers/provider-factory';

describe('AiFlowService', () => {
  let service: AiFlowService;
  const mockProvider = { generate: jest.fn(), availableModels: ['deepseek-chat'] };
  const mockFactory = { getProvider: jest.fn().mockReturnValue(mockProvider) };
  const mockConfig = { get: jest.fn().mockReturnValue('deepseek') };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiFlowService,
        { provide: LlmProviderFactory, useValue: mockFactory },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<AiFlowService>(AiFlowService);
  });

  it('LLM 返回带围栏 JSON → 解析并校验通过', async () => {
    mockProvider.generate.mockResolvedValue({
      content: '```json\n{"id":"leave_flow","name":"测试审批","version":"1.0","nodes":[{"id":"a","type":"human_task","name":"审批","roles":["admin"]}]}\n```',
    });
    const r = await service.generateFromDescription('做个审批');
    expect(r.ok).toBe(true);
    expect(r.definition?.id).toBe('leave_flow');
    expect(r.definition?.nodes[0].type).toBe('human_task');
  });

  it('LLM 返回非 JSON → ok:false', async () => {
    mockProvider.generate.mockResolvedValue({ content: '抱歉无法生成' });
    const r = await service.generateFromDescription('测试');
    expect(r.ok).toBe(false);
  });

  it('LLM 返回悬空节点引用 → 校验拒绝 ok:false', async () => {
    mockProvider.generate.mockResolvedValue({
      content: '{"id":"x","name":"x","nodes":[{"id":"a","type":"condition","name":"c","expr":"{{d}}>1","then":"gone","else":"b"},{"id":"b","type":"human_task","name":"审批"}]}',
    });
    const r = await service.generateFromDescription('测试');
    expect(r.ok).toBe(false);
  });
});
