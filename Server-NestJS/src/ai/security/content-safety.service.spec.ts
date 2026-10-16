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
    // C-4: `content_blocked` is not a tool action, so the row must carry no `outcome`/`tool` — the
    // contract answers null outside `tool_call`/`tool_confirmation`/`effect_revoke`. Locking the
    // call-site decision keeps a later edit from quietly adding a wrong outcome.
    // C-4：`content_blocked` 不是工具动作，故该行不得带 `outcome`/`tool` —— 契约在
    // `tool_call`/`tool_confirmation`/`effect_revoke` 之外一律答 null。锁住调用点的决定，后续改动就
    // 无法悄悄塞进一个错的结局。
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'content_blocked', isError: true, userId: '1', conversationId: 'c1' }),
    );
    const blockedRow = audit.log.mock.calls[0][0] as Record<string, unknown>;
    expect(blockedRow).not.toHaveProperty('outcome');
    expect(blockedRow).not.toHaveProperty('tool');
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
