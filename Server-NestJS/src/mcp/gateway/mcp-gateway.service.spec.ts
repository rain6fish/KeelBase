import { McpGatewayService, ExternalMcpTool, ExternalToolCallResult } from './mcp-gateway.service';
import { SettingsService } from '../../settings/settings.service';
import { GovernancePolicyService } from '../../ai/governance/governance-policy.service';
import { AuditService } from '../../ai/audit/audit.service';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    listTools: jest.fn().mockResolvedValue({
      tools: [
        { name: 'get_weather', description: '查天气', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
        { name: 'send_email', description: '发邮件', annotations: { readOnlyHint: false } },
      ],
    }),
    callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '晴 26°C' }], isError: false }),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn().mockImplementation(() => ({ close: jest.fn() })),
}));

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
      const out = await service.callExternalTool('nope', 't', {}, '1');
      expect(out.error).toContain('not registered');
      expect(out.executed).toBe(false);
    });

    it('策略禁用 → error', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      governance.isToolEnabled.mockResolvedValue(false);
      const out = await service.callExternalTool('wx', 'get_weather', {}, '1');
      expect(out.error).toContain('disabled by governance policy');
    });

    it('只读工具 → 默认不确认，转发 + 审计', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
      governance.requiresConfirmation.mockResolvedValue(false);
      jest.spyOn(service as any, '_callRemote').mockResolvedValue(callResult);
      const out = await service.callExternalTool('wx', 'get_weather', { city: 'sz' }, '1');
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
      const out = await service.callExternalTool('wx', 'send_email', {}, '1');
      expect(out.executed).toBe(false);
      expect(out.requiresConfirmation).toBe(true);
      expect(callSpy).not.toHaveBeenCalled();
    });

    it('策略可覆盖为免确认（非只读工具）', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
      governance.requiresConfirmation.mockResolvedValue(false);
      jest.spyOn(service as any, '_callRemote').mockResolvedValue(callResult);
      const out = await service.callExternalTool('wx', 'send_email', {}, '1');
      expect(out.executed).toBe(true);
      expect(out.requiresConfirmation).toBe(false);
    });

    it('远端失败 → error 字段', async () => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
      governance.requiresConfirmation.mockResolvedValue(false);
      jest.spyOn(service as any, '_callRemote').mockRejectedValue(new Error('remote boom'));
      const out = await service.callExternalTool('wx', 'get_weather', {}, '1');
      expect(out.error).toContain('remote boom');
    });
  });

  describe('ExternalToolProvider 接口（Agent 对话集成）', () => {
    beforeEach(() => {
      settings.get.mockResolvedValue(JSON.stringify([{ name: 'wx', url: 'http://x' }]));
      jest.spyOn(service as any, '_listTools').mockResolvedValue(tools);
    });

    it('listExternalTools 映射为 mcp_<server>_<tool> 键', async () => {
      const list = await service.listExternalTools();
      const names = list.map((t) => t.name);
      expect(names).toEqual(['mcp_wx_get_weather', 'mcp_wx_send_email']);
      expect(list[0].parameters).toBeDefined();
    });

    it('isExternal 识别 mcp_ 前缀', () => {
      expect(service.isExternal('mcp_wx_get_weather')).toBe(true);
      expect(service.isExternal('query_events')).toBe(false);
    });

    it('requiresConfirmation：非只读默认 true，策略可覆盖', async () => {
      governance.requiresConfirmation.mockResolvedValue(true);
      await expect(service.requiresConfirmation('mcp_wx_send_email')).resolves.toBe(true);
      expect(governance.requiresConfirmation).toHaveBeenCalledWith('mcp_wx_send_email', true);
      governance.requiresConfirmation.mockResolvedValue(false);
      await expect(service.requiresConfirmation('mcp_wx_send_email')).resolves.toBe(false);
    });

    it('callTool（复合键）→ 转发 + 拼文本', async () => {
      governance.requiresConfirmation.mockResolvedValue(false);
      jest.spyOn(service as any, '_callRemote').mockResolvedValue({
        content: [{ type: 'text', text: '晴 26°C' }],
        isError: false,
      });
      const out = await service.callTool('mcp_wx_get_weather', { city: 'sz' }, '1');
      expect(out.executed).toBe(true);
      expect(out.content).toBe('晴 26°C');
      expect(audit.log).toHaveBeenCalled();
    });

    it('callTool：需确认时返回 requiresConfirmation 不执行', async () => {
      governance.requiresConfirmation.mockResolvedValue(true);
      const callSpy = jest.spyOn(service as any, '_callRemote');
      const out = await service.callTool('mcp_wx_send_email', {}, '1');
      expect(out.executed).toBe(false);
      expect(out.requiresConfirmation).toBe(true);
      expect(callSpy).not.toHaveBeenCalled();
    });
  });

  describe('SDK 集成层（_listTools/_callRemote/_makeTransport）', () => {
    const server = { name: 'wx', url: 'http://x/mcp' };

    function svcWithFactory() {
      const close = jest.fn();
      const transportFactory = jest.fn().mockResolvedValue({ transport: { fake: true }, close });
      const s = new McpGatewayService(settings as any, governance as any, audit as any, undefined, transportFactory as any);
      return { s, close, transportFactory };
    }

    it('_listTools 经 transportFactory + Client 拉取并映射 readOnly', async () => {
      const { s, close, transportFactory } = svcWithFactory();
      const tools = await (s as any)._listTools(server);
      expect(transportFactory).toHaveBeenCalledWith(server);
      expect(Client).toHaveBeenCalledWith(expect.objectContaining({ name: 'keelbase-gateway' }));
      expect(tools).toHaveLength(2);
      expect(tools[0]).toMatchObject({ name: 'get_weather', readOnly: true });
      expect(tools[1]).toMatchObject({ name: 'send_email', readOnly: false });
      expect(close).toHaveBeenCalled();
    });

    it('_callRemote 调远端工具并归一化结果', async () => {
      const { s } = svcWithFactory();
      const result = await (s as any)._callRemote(server, 'get_weather', { city: 'sz' });
      expect(result).toEqual({ content: [{ type: 'text', text: '晴 26°C' }], isError: false });
    });

    it('_makeTransport 无 factory 时走默认 StreamableHTTPClientTransport', async () => {
      const s = new McpGatewayService(settings as any, governance as any, audit as any);
      const made = await (s as any)._makeTransport(server);
      expect(made.transport).toBeDefined();
      expect(typeof made.close).toBe('function');
      // 不抛错即证明默认 transport 构造可用（SDK mock）
      expect(() => made.close()).not.toThrow();
    });

    it('onModuleInit 把 gateway 注册为 AiService 外部工具提供者', async () => {
      const aiService = { registerExternalToolProvider: jest.fn() };
      const s = new McpGatewayService(settings as any, governance as any, audit as any, aiService as any);
      await s.onModuleInit();
      expect(aiService.registerExternalToolProvider).toHaveBeenCalledWith(s);
    });

    it('callTool 非 mcp_ 前缀键返回错误', async () => {
      const out = await service.callTool('query_events', {}, '1');
      expect(out.executed).toBe(false);
      expect(out.error).toContain('not an external tool key');
    });
  });
});
