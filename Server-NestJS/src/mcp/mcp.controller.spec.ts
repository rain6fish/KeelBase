import { Test } from '@nestjs/testing';
import { McpExportController } from './mcp.controller';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../ai/audit/audit.service';

describe('McpExportController (HS-10)', () => {
  let controller: McpExportController;
  let ai: jest.Mocked<Pick<AiService, 'listMcpTools' | 'executeToolForExternal'>>;
  let audit: jest.Mocked<Pick<AuditService, 'log'>>;

  const user = { sub: 1, username: 'alex', role: 'user' as const };

  beforeEach(async () => {
    ai = {
      listMcpTools: jest.fn().mockResolvedValue([
        { name: 'query_events', description: '查询事件', inputSchema: { type: 'object', properties: {} } },
      ]),
      executeToolForExternal: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        McpExportController,
        { provide: AiService, useValue: ai },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    controller = moduleRef.get(McpExportController);
  });

  it('initialize 返回 serverInfo + tools 能力', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    expect((res as any).id).toBe(1);
    expect((res as any).result.serverInfo.name).toBe('keelbase');
    expect((res as any).result.capabilities.tools).toEqual({});
  });

  it('ping 返回空 result', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', id: 2, method: 'ping' });
    expect((res as any).result).toEqual({});
  });

  it('tools/list 返回工具清单', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
    expect((res as any).result.tools).toHaveLength(1);
    expect((res as any).result.tools[0].name).toBe('query_events');
    expect((res as any).result.tools[0].inputSchema.type).toBe('object');
  });

  it('tools/call 读工具 → 执行 + 审计，返回结果', async () => {
    ai.executeToolForExternal.mockResolvedValue({
      executed: true,
      requiresConfirmation: false,
      result: { success: true, data: { total: 3 } },
    });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'query_events', arguments: { status: 'active' } },
    });
    expect(ai.executeToolForExternal).toHaveBeenCalledWith('query_events', { status: 'active' }, '1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tool_call', provider: 'mcp', userId: '1' }),
    );
    expect((res as any).result.content[0].text).toContain('3');
    expect((res as any).result.isError).toBe(false);
  });

  it('tools/call 写工具 → 不执行，返回需确认提示', async () => {
    ai.executeToolForExternal.mockResolvedValue({ executed: false, requiresConfirmation: true });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'create_event', arguments: {} },
    });
    expect((res as any).result.content[0].text).toContain('requires confirmation');
    expect((res as any).result.isError).toBe(false);
    expect(audit.log).toHaveBeenCalled();
  });

  it('tools/call 工具调用失败 → isError 标记 + 错误内容', async () => {
    ai.executeToolForExternal.mockResolvedValue({
      executed: true,
      requiresConfirmation: false,
      result: { success: false, error: 'boom' },
    });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'query_events', arguments: {} },
    });
    expect((res as any).result.isError).toBe(true);
    expect((res as any).result.content[0].text).toContain('boom');
  });

  it('未知方法 → -32601', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', id: 7, method: 'bogus' });
    expect((res as any).error.code).toBe(-32601);
  });

  it('执行抛异常 → -32603', async () => {
    ai.executeToolForExternal.mockImplementation(() => {
      throw new Error('disabled by policy');
    });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'web_search', arguments: {} },
    });
    expect((res as any).error.code).toBe(-32603);
    expect((res as any).error.message).toContain('disabled by policy');
  });

  it('通知类方法无响应', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res).toEqual({});
  });
});
