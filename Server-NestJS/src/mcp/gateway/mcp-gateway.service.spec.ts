import { McpGatewayService, ExternalMcpTool, ExternalToolCallResult } from './mcp-gateway.service';
import { SettingsService } from '../../settings/settings.service';
import { GovernancePolicyService } from '../../ai/governance/governance-policy.service';
import { AuditService } from '../../ai/audit/audit.service';

describe('McpGatewayService (HS-10 入口)', () => {
  let service: McpGatewayService;
  let settings: jest.Mocked<Pick<SettingsService, 'get' | 'set'>>;
  let governance: jest.Mocked<Pick<GovernancePolicyService, 'isToolEnabled' | 'requiresConfirmation'>>;
  let audit: jest.Mocked<Pick<AuditService, 'log'>>;

  beforeEach(() => {
    settings = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as any;
    governance = {
      isToolEnabled: jest.fn().mockResolvedValue(true),
      requiresConfirmation: jest.fn(),
    } as any;
    audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
    service = new McpGatewayService(settings as any, governance as any, audit as any);
  });

  const tools: ExternalMcpTool[] = [
    { name: 'get_weather', description: '查天气', readOnly: true },
    { name: 'send_email', description: '发邮件', readOnly: false },
  ];
  const callResult: ExternalToolCallResult = { content: [{ type: 'text', text: 'ok' }], isError: false };

  describe('server 注册（Settings 存储）', () => {
    it('未配置时返回空列表', async () => {
      await expect(service.listServers()).resolves.toEqual([]);
    });

    it('解析已存 JSON 列表', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x/mcp' }]));
      const servers = await service.listServers();
      expect(servers).toEqual([{ name: 'wx', url: 'http://x/mcp' }]);
    });

    it('非法 JSON 回退空列表', async () => {
      settings.get.mockResolvedValue('not json');
      await expect(service.listServers()).resolves.toEqual([]);
    });

    it('registerServer 追加并写回 Settings；重复名报错', async () => {
      settings.get.mockResolvedValue(null);
      const after = await service.registerServer('wx', 'http://x/mcp');
      expect(after).toEqual([{ name: 'wx', url: 'http://x/mcp' }]);
      expect(settings.set).toHaveBeenCalledWith('mcp_servers', JSON.stringify([{ name: 'wx', url: 'http://x/mcp' }]));
      // 模拟已持久化：Settings 读回含 wx 的列表 → 重复名报错
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x/mcp' }]));
      await expect(service.registerServer('wx', 'http://y')).rejects.toThrow('already registered');
    });

    it('removeServer 过滤并清缓存', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }, { name: 'py', url: 'http://y' }]));
      const after = await service.removeServer('wx');
      expect(after).toEqual([{ name: 'py', url: 'http://y' }]);
    });
  });

  describe('discoverTools', () => {
    it('逐 server 发现工具并缓存', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
      const out = await service.discoverTools();
      expect(out).toHaveLength(1);
      expect(out[0].server).toBe('wx');
      expect(out[0].tools).toHaveLength(2);
      // 缓存命中：不再次连接
      await service.discoverTools();
      expect((service as any)._listTools).toHaveBeenCalledTimes(1);
    });

    it('force 强制刷新', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
      await service.discoverTools();
      await service.discoverTools(true);
      expect((service as any)._listTools).toHaveBeenCalledTimes(2);
    });

    it('server 连接失败 → error 字段而非抛异常', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockRejectedValue(new Error('conn refused'));
      const out = await service.discoverTools();
      expect(out[0].error).toContain('conn refused');
      expect(out[0].tools).toEqual([]);
    });
  });

  describe('callTool（治理层）', () => {
    it('未注册 server → error', async () => {
      settings.get.mockResolvedValue(null);
      const out = await service.callTool('nope', 't', {}, '1');
      expect(out.error).toContain('not registered');
      expect(out.executed).toBe(false);
    });

    it('策略禁用 → error', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      governance.isToolEnabled.mockResolvedValue(false);
      const out = await service.callTool('wx', 'get_weather', {}, '1');
      expect(out.error).toContain('disabled by governance policy');
    });

    it('只读工具 → 默认不确认，转发 + 审计', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
      governance.requiresConfirmation.mockResolvedValue(false);
      jest.spyOn(service as any, '_callRemote').mockResolvedValue(callResult);
      const out = await service.callTool('wx', 'get_weather', { city: 'sz' }, '1');
      expect(out.executed).toBe(true);
      expect(out.requiresConfirmation).toBe(false);
      expect(out.result?.content[0].text).toBe('ok');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '1', action: 'tool_call', provider: 'mcp' }),
      );
    });

    it('非只读工具 → 默认需确认，不执行', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
      const callSpy = jest.spyOn(service as any, '_callRemote');
      governance.requiresConfirmation.mockResolvedValue(true);
      const out = await service.callTool('wx', 'send_email', {}, '1');
      expect(out.executed).toBe(false);
      expect(out.requiresConfirmation).toBe(true);
      expect(callSpy).not.toHaveBeenCalled();
    });

    it('策略可覆盖为免确认（非只读工具）', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
      governance.requiresConfirmation.mockResolvedValue(false);
      jest.spyOn(service as any, '_callRemote').mockResolvedValue(callResult);
      const out = await service.callTool('wx', 'send_email', {}, '1');
      expect(out.executed).toBe(true);
      expect(out.requiresConfirmation).toBe(false);
    });

    it('远端失败 → error 字段', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
      governance.requiresConfirmation.mockResolvedValue(false);
      jest.spyOn(service as any, '_callRemote').mockRejectedValue(new Error('remote boom'));
      const out = await service.callTool('wx', 'get_weather', {}, '1');
      expect(out.error).toContain('remote boom');
    });
  });
});
