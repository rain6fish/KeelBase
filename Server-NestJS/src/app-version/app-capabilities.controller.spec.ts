// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { AppCapabilitiesController } from './app-capabilities.controller';
import { CapabilitiesService } from './capabilities.service';

describe('AppCapabilitiesController（MOD-4）', () => {
  let controller: AppCapabilitiesController;

  beforeEach(async () => {
    const capabilitiesService = {
      getCapabilities: () => ({
        preset: 'lite',
        features: { ai: true, search: false },
        businessModules: [
          { id: 'events', label: '事件', description: '日历事件与提醒' },
          { id: 'todos', label: '待办', description: '待办清单与完成状态' },
        ],
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [AppCapabilitiesController],
      providers: [{ provide: CapabilitiesService, useValue: capabilitiesService }],
    }).compile();
    controller = module.get(AppCapabilitiesController);
  });

  it('委托 CapabilitiesService 返回预设 + 启用模块', () => {
    const res = controller.getCapabilities();
    expect(res.preset).toBe('lite');
    const ids = res.businessModules.map((m) => m.id);
    expect(ids).toContain('events');
    expect(ids).toContain('todos');
    // businessModules 每个带 label（前端展示用）
    expect(res.businessModules.every((m) => m.label)).toBe(true);
  });
});
