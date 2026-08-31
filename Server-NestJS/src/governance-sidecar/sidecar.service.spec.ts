import { SidecarToolRegistry } from './sidecar-tool-registry';
import { SidecarService } from './sidecar.service';

describe('SidecarToolRegistry（S-2 门控决策，对齐协议 §4）', () => {
  const defs = [
    { name: 'read_contracts', riskLevel: 'R1' },
    { name: 'send_email', riskLevel: 'R3' },
    { name: 'irreversible', riskLevel: 'R5' },
    { name: 'info', riskLevel: 'R0' },
  ];

  it('R1 读工具 → auto', () => {
    expect(new SidecarToolRegistry(defs).decide('read_contracts')).toEqual({
      decision: 'auto',
      risk: 'R1',
    });
  });

  it('R3/R4 写工具 → confirm', () => {
    expect(new SidecarToolRegistry(defs).decide('send_email')).toMatchObject({ decision: 'confirm', risk: 'R3' });
    const r4 = new SidecarToolRegistry([{ name: 'approve_payment', riskLevel: 'R4' }]);
    expect(r4.decide('approve_payment')).toMatchObject({ decision: 'confirm', risk: 'R4' });
  });

  it('R5 不可逆/外部动作 → block', () => {
    expect(new SidecarToolRegistry(defs).decide('irreversible')).toMatchObject({ decision: 'block', risk: 'R5' });
  });

  it('未知工具回退默认风险（默认 R1 auto，可配置）', () => {
    const reg = new SidecarToolRegistry(defs);
    expect(reg.decide('unknown_tool')).toEqual({ decision: 'auto', risk: 'R1' });
    const strict = new SidecarToolRegistry(defs, 'R3');
    expect(strict.decide('unknown_tool')).toMatchObject({ decision: 'confirm', risk: 'R3' });
  });

  it('治理策略 enabled=false → block（覆盖风险级）', () => {
    const reg = new SidecarToolRegistry(defs);
    reg.setPolicy({ tools: { read_contracts: { enabled: false } } });
    expect(reg.decide('read_contracts')).toMatchObject({ decision: 'block' });
  });

  it('治理策略 requiresConfirmation=true → confirm（R2 也能强制确认）', () => {
    const reg = new SidecarToolRegistry([{ name: 'low_write', riskLevel: 'R2' }]);
    reg.setPolicy({ tools: { low_write: { requiresConfirmation: true } } });
    expect(reg.decide('low_write')).toMatchObject({ decision: 'confirm' });
  });
});

describe('SidecarService（S-2 工具门控流）', () => {
  let service: SidecarService;
  let fetchMock: jest.Mock;
  let currentUpstream: Record<string, unknown>;

  const toolCall = (name: string, args = '{"a":1}') => ({
    id: `call_${name}`,
    type: 'function',
    function: { name, arguments: args },
  });
  const upstreamRes = (toolCalls: unknown[] = []) => ({
    id: 'chatcmpl-1',
    object: 'chat.completion',
    model: 'mock',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'hi',
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  beforeEach(() => {
    currentUpstream = upstreamRes();
    fetchMock = jest.fn(async (url: string) => {
      if (url.startsWith('http://upstream')) {
        return { ok: true, status: 200, json: async () => currentUpstream };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    process.env.SIDECAR_UPSTREAM_URL = 'http://upstream';
    process.env.GOVERNANCE_URL = '';
    process.env.SIDECAR_TOOLS = JSON.stringify([
      { name: 'read_x', riskLevel: 'R1' },
      { name: 'write_y', riskLevel: 'R3' },
      { name: 'do_z', riskLevel: 'R5' },
    ]);
    service = new SidecarService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (process.env as Record<string, string | undefined>).SIDECAR_TOOLS;
    delete (process.env as Record<string, string | undefined>).GOVERNANCE_URL;
    delete (process.env as Record<string, string | undefined>).SIDECAR_UPSTREAM_URL;
  });

  it('无 tool_calls → 原样返回上游响应', async () => {
    const out = (await service.proxyChat({ model: 'mock', messages: [{ role: 'user', content: 'x' }] })) as Record<string, unknown>;
    expect((out.choices as Array<{ message: { tool_calls?: unknown } }>)[0].message.tool_calls).toBeUndefined();
    expect((out as { id: string }).id).toBe('chatcmpl-1');
  });

  it('全部 auto（R1）→ 工具调用放行', async () => {
    currentUpstream = upstreamRes([toolCall('read_x')]);
    const out = (await service.proxyChat({ model: 'mock', messages: [] })) as Record<string, unknown>;
    const msg = (out.choices as Array<{ message: { tool_calls?: Array<{ function: { name: string } }> } }>)[0].message;
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls![0].function.name).toBe('read_x');
  });

  it('R5 → 阻断：清空 tool_calls + 注入拒绝说明', async () => {
    currentUpstream = upstreamRes([toolCall('do_z')]);
    const out = (await service.proxyChat({ model: 'mock', messages: [] })) as Record<string, unknown>;
    const msg = (out.choices as Array<{ message: { tool_calls: unknown; content: string }; finish_reason: string }>)[0].message;
    expect(msg.tool_calls).toBeNull();
    expect(msg.content).toContain('阻断');
    expect((out.choices as Array<{ finish_reason: string }>)[0].finish_reason).toBe('stop');
  });

  it('R3 → 确认标记（hold-and-release）：返回 confirmation token，不带 tool_calls', async () => {
    currentUpstream = upstreamRes([toolCall('write_y')]);
    const out = (await service.proxyChat({ model: 'mock', messages: [] })) as Record<string, unknown>;
    const msg = (out.choices as Array<{ message: { tool_calls: unknown; confirmation: { token: string; tools: string[] } } }>)[0].message;
    expect(msg.tool_calls).toBeNull();
    expect(msg.confirmation.token).toBeTruthy();
    expect(msg.confirmation.tools).toEqual(['write_y']);
    expect(service.pendingConfirmations()).toHaveLength(1);
  });

  it('批准后返回原响应（含 tool_calls）', async () => {
    currentUpstream = upstreamRes([toolCall('write_y')]);
    const out = (await service.proxyChat({ model: 'mock', messages: [] })) as Record<string, unknown>;
    const token = (out.choices as Array<{ message: { confirmation: { token: string } } }>)[0].message.confirmation.token;
    const approved = service.confirm(token, 'approve') as Record<string, unknown>;
    const msg = (approved.choices as Array<{ message: { tool_calls?: Array<unknown> } }>)[0].message;
    expect(msg.tool_calls).toHaveLength(1);
    expect(service.pendingConfirmations()).toHaveLength(0);
  });

  it('拒绝 → 返回拒绝响应（无 tool_calls）', async () => {
    currentUpstream = upstreamRes([toolCall('write_y')]);
    const out = (await service.proxyChat({ model: 'mock', messages: [] })) as Record<string, unknown>;
    const token = (out.choices as Array<{ message: { confirmation: { token: string } } }>)[0].message.confirmation.token;
    const rejected = service.confirm(token, 'reject') as Record<string, unknown>;
    const msg = (rejected.choices as Array<{ message: { tool_calls: unknown; content: string } }>)[0].message;
    expect(msg.tool_calls).toBeNull();
    expect(msg.content).toContain('拒绝');
  });

  it('未知/过期 token → 404', () => {
    expect(() => service.confirm('nope', 'approve')).toThrow();
    expect(service.pendingConfirmations()).toHaveLength(0);
  });

  it('B2 applyPushedPolicy：治理台推送禁用 → 工具调用实时被阻断', async () => {
    // 初始：write_y（R3）→ confirm；推送禁用后 → block（门控流真实行为）
    currentUpstream = upstreamRes([toolCall('write_y')]);
    const out = service.applyPushedPolicy({ tools: { write_y: { enabled: false } } }, '2026-09-01T00:00:00Z');
    expect(out).toEqual({ accepted: true, pushedAt: '2026-09-01T00:00:00Z' });
    const gated = (await service.proxyChat({ model: 'mock', messages: [] })) as Record<string, unknown>;
    const msg = (gated.choices as Array<{ message: { content: string; tool_calls: unknown } }>)[0].message;
    expect(msg.tool_calls).toBeNull();
    expect(msg.content).toContain('阻断');
    // 未推送工具不受影响：read_x 仍 auto 放行
    currentUpstream = upstreamRes([toolCall('read_x')]);
    const auto = (await service.proxyChat({ model: 'mock', messages: [] })) as Record<string, unknown>;
    expect((auto.choices as Array<{ message: { tool_calls?: Array<unknown> } }>)[0].message.tool_calls).toHaveLength(1);
  });

  it('B2 applyPushedPolicy：requiresConfirmation 覆盖 → 读工具被强制确认', async () => {
    currentUpstream = upstreamRes([toolCall('read_x')]);
    service.applyPushedPolicy({ tools: { read_x: { requiresConfirmation: true } } });
    const out = (await service.proxyChat({ model: 'mock', messages: [] })) as Record<string, unknown>;
    const msg = (out.choices as Array<{ message: { confirmation: { tools: string[] } } }>)[0].message;
    expect(msg.confirmation.tools).toEqual(['read_x']);
    expect(service.pendingConfirmations()).toHaveLength(1);
  });
});
