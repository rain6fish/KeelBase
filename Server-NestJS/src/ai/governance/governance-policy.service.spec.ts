import { GovernancePolicyService } from './governance-policy.service';
import { SettingsService } from '../../settings/settings.service';

describe('GovernancePolicyService (HS-9)', () => {
  let service: GovernancePolicyService;
  let settings: jest.Mocked<Pick<SettingsService, 'get'>>;

  beforeEach(() => {
    settings = { get: jest.fn() } as jest.Mocked<Pick<SettingsService, 'get'>>;
    service = new GovernancePolicyService(settings as unknown as SettingsService);
  });

  const KEY = GovernancePolicyService.SETTING_KEY;

  describe('getPolicy', () => {
    it('未配置 → 默认全放行 + 审计 all', async () => {
      settings.get.mockResolvedValue(null);
      const policy = await service.getPolicy();
      expect(policy.tools).toEqual({});
      expect(policy.audit.granularity).toBe('all');
      expect(settings.get).toHaveBeenCalledWith(KEY);
    });

    it('JSON 字符串策略被解析', async () => {
      settings.get.mockResolvedValue(
        JSON.stringify({
          tools: { create_event: { enabled: false } },
          audit: { granularity: 'write' },
        }),
      );
      const policy = await service.getPolicy();
      expect(policy.tools.create_event.enabled).toBe(false);
      expect(policy.audit.granularity).toBe('write');
    });

    it('非法 JSON → 回退默认', async () => {
      settings.get.mockResolvedValue('{ not valid json');
      const policy = await service.getPolicy();
      expect(policy.tools).toEqual({});
      expect(policy.audit.granularity).toBe('all');
    });

    it('非法 granularity → 回退 all', async () => {
      settings.get.mockResolvedValue(JSON.stringify({ audit: { granularity: 'bogus' } }));
      const policy = await service.getPolicy();
      expect(policy.audit.granularity).toBe('all');
    });
  });

  describe('getToolPolicy（默认 + 覆盖合并）', () => {
    it('未配置 → 默认值生效', async () => {
      settings.get.mockResolvedValue(null);
      const p = await service.getToolPolicy('create_event', { requiresConfirmation: true });
      expect(p.enabled).toBe(true);
      expect(p.requiresConfirmation).toBe(true);
      expect(p.allowedRoles).toEqual([]);
    });

    it('策略覆盖默认', async () => {
      settings.get.mockResolvedValue(
        JSON.stringify({
          tools: {
            create_event: { enabled: false, requiresConfirmation: false, allowedRoles: ['admin'] },
          },
        }),
      );
      const p = await service.getToolPolicy('create_event', { requiresConfirmation: true });
      expect(p.enabled).toBe(false);
      expect(p.requiresConfirmation).toBe(false);
      expect(p.allowedRoles).toEqual(['admin']);
    });
  });

  describe('便捷方法', () => {
    it('isToolEnabled 读取策略开关', async () => {
      settings.get.mockResolvedValue(JSON.stringify({ tools: { web_search: { enabled: false } } }));
      await expect(service.isToolEnabled('web_search')).resolves.toBe(false);
      await expect(service.isToolEnabled('query_events')).resolves.toBe(true);
    });

    it('requiresConfirmation 覆盖工具默认', async () => {
      settings.get.mockResolvedValue(JSON.stringify({ tools: { create_todo: { requiresConfirmation: false } } }));
      await expect(service.requiresConfirmation('create_todo', true)).resolves.toBe(false);
      await expect(service.requiresConfirmation('other', true)).resolves.toBe(true);
    });

    it('getAllowedRoles 返回白名单', async () => {
      settings.get.mockResolvedValue(JSON.stringify({ tools: { x: { allowedRoles: ['admin'] } } }));
      await expect(service.getAllowedRoles('x')).resolves.toEqual(['admin']);
      await expect(service.getAllowedRoles('y')).resolves.toEqual([]);
    });

    it('getAuditGranularity 返回配置值', async () => {
      settings.get.mockResolvedValue(JSON.stringify({ audit: { granularity: 'off' } }));
      await expect(service.getAuditGranularity()).resolves.toBe('off');
    });
  });
});
