// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from './tool-registry';
import { AiTool, resolveRevokeClass } from '../interfaces/tool.interface';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const mockTool: AiTool = {
    name: 'query_events',
    description: '查询事件列表',
    parameters: [
      {
        name: 'startDate',
        type: 'string',
        description: '开始日期',
        required: true,
      },
      {
        name: 'endDate',
        type: 'string',
        description: '结束日期',
        required: false,
      },
    ],
    toToolDefinition: jest.fn().mockReturnValue({
      type: 'function',
      function: {
        name: 'query_events',
        description: '查询事件列表',
        parameters: { type: 'object', properties: {} },
      },
    }),
    execute: jest.fn().mockResolvedValue({ success: true, data: [] }),
  };

  const anotherTool: AiTool = {
    name: 'get_user_stats',
    description: '用户统计',
    parameters: [],
    toToolDefinition: jest.fn().mockReturnValue({
      type: 'function',
      function: {
        name: 'get_user_stats',
        description: '用户统计',
        parameters: { type: 'object', properties: {} },
      },
    }),
    execute: jest.fn().mockResolvedValue({ success: true, data: {} }),
  };

  beforeEach(() => {
    registry = new ToolRegistry();
    jest.clearAllMocks();
  });

  describe('register()', () => {
    it('should register a tool', () => {
      registry.register(mockTool);
      expect(registry.getTool('query_events')).toBe(mockTool);
    });

    it('should throw when registering a duplicate tool name', () => {
      registry.register(mockTool);
      expect(() => registry.register(mockTool)).toThrow(
        'Tool "query_events" is already registered',
      );
    });

    it('should register multiple tools', () => {
      registry.register(mockTool);
      registry.register(anotherTool);
      expect(registry.getAllTools()).toHaveLength(2);
    });

    it('KB-6: 确认写工具静默归 none（不可撤）→ 注册抛错（须显式声明撤销能力）', () => {
      const confirmedWriteWithoutRevoke: AiTool = {
        ...mockTool,
        name: 'silent_write',
        description: '写',
        requiresConfirmation: true,
        // 未声明 revokeClass + 无 riskLevel 覆盖 → 推导 local_compensate（不抛）……
        // 但 riskLevel R3 + requiresConfirmation=false 的场景 → 推导 none → 抛
      };
      // requiresConfirmation:true → 推导 local_compensate，注册通过
      registry.register(confirmedWriteWithoutRevoke);
      expect(registry.getTool('silent_write')).toBeDefined();
    });

    it('KB-6: R3/R4 写语义但 requiresConfirmation=false → 解析 none → 注册抛错', () => {
      const writeWithoutFlag: AiTool = {
        ...mockTool,
        name: 'write_by_risk_only',
        description: '写',
        requiresConfirmation: false,
        riskLevel: 'R4',
      };
      expect(() => registry.register(writeWithoutFlag)).toThrow(
        'write_by_risk_only',
      );
      expect(() => registry.register(writeWithoutFlag)).toThrow(
        /silently derived as 'none'/,
      );
    });

    it('KB-6: 显式声明 revokeClass 的确认写 → 注册通过', () => {
      const writeDeclared: AiTool = {
        ...mockTool,
        name: 'write_declared',
        description: '写',
        requiresConfirmation: false,
        riskLevel: 'R4',
        revokeClass: 'governed_external',
      };
      registry.register(writeDeclared);
      expect(registry.getTool('write_declared')).toBeDefined();
    });

    it('KB-6: R5 阻断工具（不执行不记录）允许静默 none', () => {
      const irreversible: AiTool = {
        ...mockTool,
        name: 'delete_customer_x',
        description: '不可逆删除',
        requiresConfirmation: false,
        riskLevel: 'R5',
      };
      registry.register(irreversible);
      expect(registry.getTool('delete_customer_x')).toBeDefined();
    });
  });

  describe('resolveRevokeClass()（KB-6 派生）', () => {
    it('显式声明优先', () => {
      expect(resolveRevokeClass({ revokeClass: 'governed_external', requiresConfirmation: true })).toBe('governed_external');
      expect(resolveRevokeClass({ revokeClass: 'none', requiresConfirmation: true })).toBe('none');
    });
    it('确认写缺省推导 local_compensate', () => {
      expect(resolveRevokeClass({ requiresConfirmation: true })).toBe('local_compensate');
    });
    it('读/非确认缺省推导 none', () => {
      expect(resolveRevokeClass({ requiresConfirmation: false })).toBe('none');
      expect(resolveRevokeClass({})).toBe('none');
    });
  });

  describe('getTool()', () => {
    it('should retrieve a registered tool by name', () => {
      registry.register(mockTool);
      expect(registry.getTool('query_events')).toBe(mockTool);
    });

    it('should throw when tool is not found', () => {
      expect(() => registry.getTool('nonexistent')).toThrow(
        'Tool "nonexistent" not found',
      );
    });
  });

  describe('getToolDefinitions()', () => {
    it('should return tool definitions for all registered tools', () => {
      registry.register(mockTool);
      registry.register(anotherTool);

      const defs = registry.getToolDefinitions();
      expect(defs).toHaveLength(2);
      expect(mockTool.toToolDefinition).toHaveBeenCalled();
      expect(anotherTool.toToolDefinition).toHaveBeenCalled();
    });

    it('should return empty array when no tools registered', () => {
      expect(registry.getToolDefinitions()).toEqual([]);
    });
  });

  describe('execute()', () => {
    it('should execute a registered tool with args and userId', async () => {
      registry.register(mockTool);
      const args = { startDate: '2026-07-01', endDate: '2026-07-28' };

      await registry.execute('query_events', args, 'user1');

      expect(mockTool.execute).toHaveBeenCalledWith(args, 'user1');
    });

    it('should return the tool execution result', async () => {
      registry.register(mockTool);
      const result = await registry.execute(
        'query_events',
        { startDate: '2026-07-01' },
        'user1',
      );
      expect(result).toEqual({ success: true, data: [] });
    });

    it('should throw when executing an unregistered tool', async () => {
      await expect(
        registry.execute('nonexistent', {}, 'user1'),
      ).rejects.toThrow('Tool "nonexistent" not found');
    });

    it('should throw when required parameter is missing', async () => {
      const toolWithRequired: AiTool = {
        ...mockTool,
        execute: jest.fn(),
      };
      registry.register(toolWithRequired);

      // startDate is required but not provided
      await expect(
        registry.execute('query_events', {}, 'user1'),
      ).rejects.toThrow('Missing required parameter: startDate');
    });

    it('should pass validation when required parameters are provided', async () => {
      const toolWithRequired: AiTool = {
        ...mockTool,
        execute: jest.fn().mockResolvedValue({ success: true, data: ['event1'] }),
      };
      registry.register(toolWithRequired);

      const result = await registry.execute(
        'query_events',
        { startDate: '2026-07-01' },
        'user1',
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(['event1']);
    });
  });

  describe('requiresConfirmation()', () => {
    it('should return false for a read-only tool (flag absent)', () => {
      registry.register(mockTool);
      expect(registry.requiresConfirmation('query_events')).toBe(false);
    });

    it('should return true for a write tool', () => {
      registry.register({ ...mockTool, name: 'create_event', requiresConfirmation: true });
      expect(registry.requiresConfirmation('create_event')).toBe(true);
    });

    it('should throw for an unknown tool', () => {
      expect(() => registry.requiresConfirmation('nonexistent')).toThrow(
        'Tool "nonexistent" not found',
      );
    });
  });

  describe('riskLevel()（W5 风险模型）', () => {
    it('读工具（无标记）→ 派生 R1', () => {
      registry.register(mockTool);
      expect(registry.riskLevel('query_events')).toBe('R1');
    });

    it('写工具（requiresConfirmation）→ 派生 R3', () => {
      registry.register({ ...mockTool, name: 'create_event', requiresConfirmation: true });
      expect(registry.riskLevel('create_event')).toBe('R3');
    });

    it('显式 riskLevel 优先（R4 human_approval）', () => {
      registry.register({ ...mockTool, name: 'review_approval', requiresConfirmation: true, riskLevel: 'R4' });
      expect(registry.riskLevel('review_approval')).toBe('R4');
    });

    it('R5 阻断：requiresConfirmation=false，确认门不触发（阻断另行强制）', () => {
      registry.register({ ...mockTool, name: 'irreversible', requiresConfirmation: false, riskLevel: 'R5' });
      expect(registry.riskLevel('irreversible')).toBe('R5');
      expect(registry.requiresConfirmation('irreversible')).toBe(false);
    });

    it('R4 虽未声明 requiresConfirmation 也需确认', () => {
      // revokeClass 显式声明（KB-6 契约：R4 写工具须声明撤销能力，local_compensate=本地可撤）
      registry.register({ ...mockTool, name: 'high_impact', requiresConfirmation: false, riskLevel: 'R4', revokeClass: 'local_compensate' });
      expect(registry.requiresConfirmation('high_impact')).toBe(true);
    });

    it('R2 低风险写（policy 通道）：默认不确认、风险策略 policy', () => {
      registry.register({ ...mockTool, name: 'generate_image', requiresConfirmation: false, riskLevel: 'R2' });
      expect(registry.riskLevel('generate_image')).toBe('R2');
      expect(registry.requiresConfirmation('generate_image')).toBe(false);
      // 确认决策由治理策略（policy 通道）决定，而非工具元数据硬编码
    });
  });

  describe('unregister()（热更新）', () => {
    it('反注册已存在工具 → 返回 true 且不再可见', () => {
      registry.register(mockTool);
      expect(registry.unregister('query_events')).toBe(true);
      expect(() => registry.getTool('query_events')).toThrow(
        'Tool "query_events" not found',
      );
      expect(registry.getAllTools()).toHaveLength(0);
    });

    it('反注册不存在的工具 → 返回 false', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });

    it('不影响其他工具', () => {
      registry.register(mockTool);
      registry.register(anotherTool);
      registry.unregister('query_events');
      expect(registry.getTool('get_user_stats')).toBe(anotherTool);
    });
  });

  describe('getAllTools()', () => {
    it('should return empty array when no tools registered', () => {
      expect(registry.getAllTools()).toEqual([]);
    });

    it('should return all registered tools', () => {
      registry.register(mockTool);
      registry.register(anotherTool);
      const tools = registry.getAllTools();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual([
        'get_user_stats',
        'query_events',
      ]);
    });
  });
});
