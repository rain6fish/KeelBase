// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { ContentSafetyService } from './content-safety.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditService } from '../audit/audit.service';

describe('ContentSafetyService（N-6 AI-23 深度化）', () => {
  let service: ContentSafetyService;
  const settings = { getWithDefault: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    settings.getWithDefault.mockResolvedValue('');
    const module = await Test.createTestingModule({
      providers: [
        ContentSafetyService,
        { provide: SettingsService, useValue: settings },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(ContentSafetyService);
  });

  it('Settings 无值 → 默认配置（启用 + 默认敏感表）', async () => {
    const cfg = await service.getConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.sensitive.length).toBeGreaterThan(0);
  });

  it('Settings 非法 JSON → 兜底默认', async () => {
    settings.getWithDefault.mockResolvedValue('not-json');
    const cfg = await service.getConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.sensitive.length).toBeGreaterThan(0);
  });

  it('Settings 合法 JSON → 自定义词生效', async () => {
    settings.getWithDefault.mockResolvedValue(
      JSON.stringify({ enabled: true, sensitive: ['自定义违规词'], jailbreak: [] }),
    );
    const cfg = await service.getConfig();
    expect(cfg.sensitive).toEqual(['自定义违规词']);
  });

  it('enabled=false → 放行且不审计', async () => {
    settings.getWithDefault.mockResolvedValue(
      JSON.stringify({ enabled: false, sensitive: ['怎么自杀'], jailbreak: [] }),
    );
    const r = await service.check('怎么自杀', { userId: '1' });
    expect(r.blocked).toBe(false);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('命中 → blocked + 写审计（action=content_blocked）', async () => {
    settings.getWithDefault.mockResolvedValue(
      JSON.stringify({ enabled: true, sensitive: ['怎么自杀'], jailbreak: [] }),
    );
    const r = await service.check('怎么自杀', { userId: '1', conversationId: 'c1' });
    expect(r.blocked).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'content_blocked', isError: true, userId: '1', conversationId: 'c1' }),
    );
  });

  it('未命中 → 放行不审计', async () => {
    settings.getWithDefault.mockResolvedValue(
      JSON.stringify({ enabled: true, sensitive: ['怎么自杀'], jailbreak: [] }),
    );
    const r = await service.check('正常业务问题', { userId: '1' });
    expect(r.blocked).toBe(false);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
