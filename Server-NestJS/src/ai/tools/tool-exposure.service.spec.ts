// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ToolExposureService } from './tool-exposure.service';
import { ToolRegistry } from './tool-registry';
import { ToolGateService } from './tool-gate.service';
import { ExternalToolRegistry } from './external-tool-registry';

/**
 * 工具对外面单测（阶段 3 第九刀从 `ai.service.spec.ts` 整段搬来，**断言一字未改**；
 * 文末 getToolFingerprint 一组为搬迁时新增的护栏，已标注）。
 * 门控用真实实例（与 ai.service.spec 同口径）：mock 掉就丢了被测对象——
 * 「R5 阻断」「治理策略禁用」这些断言正是穿过它成立的。
 */
describe('ToolExposureService（工具对外面）', () => {
  let exposure: ToolExposureService;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let mockToolGate: ToolGateService;
  let externalTools: ExternalToolRegistry;
  let mockSettingsService: { getWithDefault: jest.Mock };

  beforeEach(() => {
    mockToolRegistry = {
      getToolDefinitions: jest.fn().mockReturnValue([]),
      execute: jest.fn(),
      register: jest.fn(),
      getTool: jest.fn(),
      getAllTools: jest.fn(),
      requiresConfirmation: jest.fn().mockReturnValue(false),
      riskLevel: jest.fn().mockReturnValue('R1'),
    } as any;
    externalTools = new ExternalToolRegistry();
    mockToolGate = new ToolGateService(mockToolRegistry as any, externalTools);
    mockSettingsService = { getWithDefault: jest.fn() };
    exposure = new ToolExposureService(
      mockToolRegistry as any,
      mockToolGate as any,
      externalTools,
    );
    (exposure as any).settingsService = mockSettingsService;
  });

  describe('HS-10 MCP 出口方法', () => {
    describe('listMcpTools', () => {
      it('把工具定义映射为 MCP 工具清单（含风险分级与确认策略声明，A2 Secure MCP Gateway）', async () => {
        mockToolRegistry.getToolDefinitions.mockReturnValue([
          { type: 'function', function: { name: 'query_events', description: '查事件', parameters: { type: 'object', properties: { status: {} } } } },
        ] as any);
        mockToolRegistry.riskLevel.mockReturnValue('R1');
        mockToolRegistry.requiresConfirmation.mockReturnValue(false);
        const tools = await exposure.listMcpTools();
        expect(tools).toEqual([
          {
            name: 'query_events',
            description: '查事件',
            inputSchema: { type: 'object', properties: { status: {} } },
            riskLevel: 'R1',
            riskStrategy: 'auto',
            requiresConfirmation: false,
          },
        ]);
      });

      it('写工具在 MCP 清单中声明确认策略（R3 confirmation）', async () => {
        mockToolRegistry.getToolDefinitions.mockReturnValue([
          { type: 'function', function: { name: 'create_event', description: '', parameters: {} } },
        ] as any);
        mockToolRegistry.riskLevel.mockReturnValue('R3');
        mockToolRegistry.requiresConfirmation.mockReturnValue(true);
        const tools = await exposure.listMcpTools();
        expect(tools[0].riskLevel).toBe('R3');
        expect(tools[0].riskStrategy).toBe('confirmation');
        expect(tools[0].requiresConfirmation).toBe(true);
      });

      it('未注入治理策略时返回全部工具', async () => {
        mockToolRegistry.getToolDefinitions.mockReturnValue([
          { type: 'function', function: { name: 'a', description: '', parameters: {} } },
          { type: 'function', function: { name: 'b', description: '', parameters: {} } },
        ] as any);
        const tools = await exposure.listMcpTools();
        expect(tools).toHaveLength(2);
      });
    });

    describe('executeToolForExternal', () => {
      it('读工具（无需确认）→ 直接执行', async () => {
        mockToolRegistry.requiresConfirmation.mockReturnValue(false);
        mockToolRegistry.execute.mockResolvedValue({ success: true, data: { total: 1 } });
        const out = await exposure.executeToolForExternal('query_events', { status: 'active' }, '1');
        expect(out.executed).toBe(true);
        expect(out.requiresConfirmation).toBe(false);
        expect(mockToolRegistry.execute).toHaveBeenCalledWith('query_events', { status: 'active' }, '1');
        // ② 绑定：工具调用响应键集 ⊆ tool-invocation.response 冻结契约
        const respProps = Object.keys(
          (
            JSON.parse(
              readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v1/tool-invocation.schema.json'), 'utf8'),
            ) as { properties: { response: { properties: Record<string, unknown> } } }
          ).properties.response.properties,
        );
        expect(Object.keys(out).filter((k) => !respProps.includes(k))).toEqual([]);
      });

      it('写工具（需确认）→ 不执行，返回需确认信号', async () => {
        mockToolRegistry.requiresConfirmation.mockReturnValue(true);
        const out = await exposure.executeToolForExternal('create_event', {}, '1');
        expect(out.executed).toBe(false);
        expect(out.requiresConfirmation).toBe(true);
        expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      });

      it('R5 风险级 → 阻断（不执行也不确认）', async () => {
        mockToolRegistry.getTool.mockReturnValue({ name: 'irreversible_action', riskLevel: 'R5' });
        mockToolRegistry.riskLevel.mockReturnValue('R5');
        await expect(
          exposure.executeToolForExternal('irreversible_action', {}, '1'),
        ).rejects.toThrow('is blocked (risk level R5)');
        expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      });

      it('R5 阻断错误携带结构化拒绝原因（AuthorizationDeniedError）', async () => {
        mockToolRegistry.getTool.mockReturnValue({ name: 'irreversible_action', riskLevel: 'R5' });
        mockToolRegistry.riskLevel.mockReturnValue('R5');
        const err = await exposure
          .executeToolForExternal('irreversible_action', {}, '1')
          .catch((e: any) => e);
        expect(err.reasons).toBeDefined();
        expect(err.reasons.some((c: any) => c.name === 'risk_policy' && c.ok === false)).toBe(true);
      });

      it('治理策略禁用 → 拒绝并携带 tool_enabled 失败原因', async () => {
        mockToolRegistry.getTool.mockReturnValue({ name: 'create_event', requiresConfirmation: true });
        mockToolRegistry.riskLevel.mockReturnValue('R3');
        (mockToolGate as any).governancePolicy = {
          isToolEnabled: jest.fn().mockResolvedValue(false),
          getAllowedRoles: jest.fn().mockResolvedValue([]),
        };
        const err = await exposure
          .executeToolForExternal('create_event', {}, '1')
          .catch((e: any) => e);
        expect(err.message).toContain('disabled by governance policy');
        expect(err.reasons).toBeDefined();
        expect(err.reasons.some((c: any) => c.name === 'tool_enabled' && c.ok === false)).toBe(true);
      });

      it('R2 工具（policy 通道）：默认自动执行；治理策略强制确认后需确认', async () => {
        // 默认：R2 低风险写 → 自动执行（无需确认）
        mockToolRegistry.riskLevel.mockReturnValue('R2');
        mockToolRegistry.requiresConfirmation.mockReturnValue(false);
        mockToolRegistry.execute.mockResolvedValue({ success: true, data: { url: 'x' } });
        const out = await exposure.executeToolForExternal('generate_image', { prompt: 'logo' }, '1');
        expect(out.executed).toBe(true);
        expect(out.requiresConfirmation).toBe(false);

        // R2 policy 通道：治理策略强制确认 → 需确认（低风险写可被治理收紧）
        (mockToolGate as any).governancePolicy = {
          isToolEnabled: jest.fn().mockResolvedValue(true),
          getAllowedRoles: jest.fn().mockResolvedValue([]),
          requiresConfirmation: jest.fn().mockResolvedValue(true),
        };
        mockToolRegistry.riskLevel.mockReturnValue('R2');
        mockToolRegistry.requiresConfirmation.mockReturnValue(false);
        const out2 = await exposure.executeToolForExternal('generate_image', { prompt: 'logo' }, '1');
        expect(out2.executed).toBe(false);
        expect(out2.requiresConfirmation).toBe(true);
        expect(mockToolRegistry.execute).toHaveBeenCalledTimes(1);
      });

      it('R4 风险级（human_approval）→ 仍需确认', async () => {
        mockToolRegistry.riskLevel.mockReturnValue('R4');
        mockToolRegistry.requiresConfirmation.mockReturnValue(true);
        const out = await exposure.executeToolForExternal('review_approval_request', { requestId: 1 }, '1');
        expect(out.executed).toBe(false);
        expect(out.requiresConfirmation).toBe(true);
      });
    });
  });

  describe('getToolInventory（HS-2 工具清单）', () => {
    it('暴露 riskLevel / riskStrategy', async () => {
      const fakeTool = {
        name: 'review_approval_request',
        description: '审批预审',
        parameters: [{ name: 'requestId', type: 'number', required: true }],
        requiresConfirmation: true,
      };
      mockToolRegistry.getAllTools.mockReturnValue([fakeTool as any]);
      mockToolRegistry.riskLevel.mockReturnValue('R4');
      const inv = await exposure.getToolInventory();
      expect(inv).toHaveLength(1);
      expect(inv[0].riskLevel).toBe('R4');
      expect(inv[0].riskStrategy).toBe('human_approval');
      expect(inv[0].requiresConfirmation).toBe(true);
      // §internal.15(4)：R4 声明 → 生效档位 approval + 需审批
      expect(inv[0].gateMode).toBe('approval');
      expect(inv[0].requiresApproval).toBe(true);
      // ② 绑定：工具清单项键集 == ai-tool-inventory 冻结契约
      const invProps = Object.keys(
        (
          JSON.parse(
            readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v1/ai-tool-inventory.schema.json'), 'utf8'),
          ) as { properties: Record<string, unknown> }
        ).properties,
      );
      expect(Object.keys(inv[0]).sort()).toEqual(invProps.sort());
    });

    it('getToolInventory：策略 mode=approval 把 R3 工具升档为审批档（§internal.15(4)）', async () => {
      (exposure as any).governancePolicy = {
        getPolicy: jest.fn().mockResolvedValue({ tools: { create_customer: { mode: 'approval' } } }),
      };
      mockToolRegistry.getAllTools.mockReturnValue([{ name: 'create_customer', description: 'd', parameters: [] }] as any);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      const inv = await exposure.getToolInventory();
      expect(inv[0].requiresApproval).toBe(true);
      expect(inv[0].gateMode).toBe('approval');
      expect(inv[0].requiresConfirmation).toBe(true);
    });

    it('getProxyIntegrationStatus：未配置 → configured:false', async () => {
      mockSettingsService.getWithDefault.mockResolvedValue(null);
      const r = await exposure.getProxyIntegrationStatus();
      expect(r.configured).toBe(false);
    });

    it('getProxyIntegrationStatus：配置 + status 可达 → 透传面板字段', async () => {
      mockSettingsService.getWithDefault.mockResolvedValue(
        JSON.stringify({ baseUrl: 'http://localhost:8082', audience: 'legacy-crm', tools: [{ name: 'x' }, { name: 'y' }] }),
      );
      const orig = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ health: { status: 'UP' }, tools: { count: 2 } }),
      }) as any;
      try {
        const r = await exposure.getProxyIntegrationStatus();
        expect(r.configured).toBe(true);
        expect(r.reachable).toBe(true);
        expect(r.statusEnabled).toBe(true);
        expect(r.configuredTools).toBe(2);
        expect((r.health as any).status).toBe('UP');
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8082/keelbase/status',
          expect.objectContaining({ signal: expect.anything() }),
        );
      } finally {
        global.fetch = orig;
      }
    });

    it('getProxyIntegrationStatus：非 200 → statusEnabled:false + error', async () => {
      mockSettingsService.getWithDefault.mockResolvedValue(
        JSON.stringify({ baseUrl: 'http://localhost:8082', tools: [] }),
      );
      const orig = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
      try {
        const r = await exposure.getProxyIntegrationStatus();
        expect(r.reachable).toBe(true);
        expect(r.statusEnabled).toBe(false);
        expect(r.error).toContain('404');
      } finally {
        global.fetch = orig;
      }
    });

    it('getProxyIntegrationStatus：网络失败 → reachable:false', async () => {
      mockSettingsService.getWithDefault.mockResolvedValue(
        JSON.stringify({ baseUrl: 'http://localhost:8082', tools: [] }),
      );
      const orig = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
      try {
        const r = await exposure.getProxyIntegrationStatus();
        expect(r.reachable).toBe(false);
        expect(r.configured).toBe(true);
      } finally {
        global.fetch = orig;
      }
    });

  });

    it('_buildToolDefs 合并内置 + 外部工具定义', async () => {
      mockToolRegistry.getToolDefinitions.mockReturnValue([
        { type: 'function', function: { name: 'query_events', description: '查事件', parameters: {} } },
      ] as any);
      const provider = {
        listExternalTools: jest.fn().mockResolvedValue([
          { name: 'mcp_wx_get_weather', description: '查天气', parameters: { type: 'object' } },
          { name: 'mcp_wx_send_email', description: '发邮件', parameters: { type: 'object' } },
        ]),
        isExternal: jest.fn(),
        requiresConfirmation: jest.fn(),
        callTool: jest.fn(),
      };
      exposure.registerExternalToolProvider(provider as any);

      const defs = await exposure.buildToolDefs();
      const names = defs.map((d: any) => d.function.name);
      expect(names).toContain('mcp_wx_get_weather');
      expect(names).toContain('mcp_wx_send_email');
      expect(names).toContain('query_events'); // 内置仍在
      expect(provider.listExternalTools).toHaveBeenCalled();
    });

    it('外部提供者缺失时 buildToolDefs 只返回内置', async () => {
      // 提供者由**共享持有者**承载（阶段 3 门控刀起，它不再挂在单个实例上）。
      // 本测试的原意是「没有提供者的服务只返回内置」，故给一个**空的**持有者。
      const plain = new ToolExposureService(
        mockToolRegistry as any,
        mockToolGate as any,
        new ExternalToolRegistry(),
      );
      mockToolRegistry.getToolDefinitions.mockReturnValue([
        { type: 'function', function: { name: 'query_events', description: '查事件', parameters: {} } },
      ] as any);
      const defs = await plain.buildToolDefs();
      expect(defs.map((d: any) => d.function.name)).toEqual(['query_events']);
    });


  describe('治理策略对清单/出口的影响（搬迁自 ai.service.spec 的散落用例）', () => {
    it('getToolInventory：治理策略覆盖开关', async () => {
      const tool = { name: 'query_events', description: 'd', parameters: [], toToolDefinition: () => ({}) };
      (exposure as any).governancePolicy = {
        getPolicy: jest.fn().mockResolvedValue({ tools: { query_events: { enabled: false, requiresConfirmation: true } } }),
      };
      mockToolRegistry.getAllTools.mockReturnValue([tool] as any);
      const inv = await exposure.getToolInventory();
      expect(inv[0].name).toBe('query_events');
      expect(inv[0].enabled).toBe(false);
    });
    it('listMcpTools：治理策略禁用工具时跳过', async () => {
      (exposure as any).governancePolicy = { isToolEnabled: jest.fn().mockResolvedValue(false) };
      mockToolRegistry.getToolDefinitions.mockReturnValue([
        { type: 'function', function: { name: 'query_events', description: 'd', parameters: {} } },
      ] as any);
      const tools = await exposure.listMcpTools();
      expect(tools).toEqual([]);
      (exposure as any).governancePolicy = undefined;
    });
  });

  // ── 以下一组为搬迁时**新增**的护栏：getToolFingerprint 此前无直接覆盖 ──

  describe('搬迁时新增的护栏：getToolFingerprint', () => {
    it('只给汇总指纹：总数 / 读写分类 / 风险级分布（不含参数与权限详情）', () => {
      mockToolRegistry.getAllTools.mockReturnValue([
        { name: 'query_events', requiresConfirmation: false },
        { name: 'create_event', requiresConfirmation: true },
        { name: 'delete_customer', requiresConfirmation: true },
      ] as any);
      mockToolRegistry.riskLevel.mockImplementation((n: string) => (n === 'query_events' ? 'R1' : 'R3'));
      expect(exposure.getToolFingerprint()).toEqual({
        total: 3,
        read: 1,
        write: 2,
        byRisk: { R1: 1, R3: 2 },
      });
    });
  });
});
