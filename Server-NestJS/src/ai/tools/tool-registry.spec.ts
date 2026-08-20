import { ToolRegistry } from './tool-registry';
import { AiTool } from '../interfaces/tool.interface';

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
      registry.register({ ...mockTool, name: 'high_impact', requiresConfirmation: false, riskLevel: 'R4' });
      expect(registry.requiresConfirmation('high_impact')).toBe(true);
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
