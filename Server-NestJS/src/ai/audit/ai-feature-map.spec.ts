import { aiActionLabel } from './ai-feature-map';

describe('aiActionLabel（D2 人类语言审计标签）', () => {
  it('已知 action → 语义 key + fallback', () => {
    expect(aiActionLabel('chat')).toEqual({ key: 'ai.chat', fallback: 'AI · Chat' });
    expect(aiActionLabel('tool_call')).toEqual({ key: 'ai.toolCall', fallback: 'AI · Tool call' });
    expect(aiActionLabel('knowledge')).toEqual({ key: 'ai.knowledge', fallback: 'AI · Knowledge' });
  });

  it('detail 含已映射工具名 → 工具名级人类语言（创建客户跟进任务而非技术名）', () => {
    // 实际 detail 格式：toolName({args})
    expect(aiActionLabel('tool_call', 'create_followup_task({"customerId":1})')).toEqual({
      key: 'ai.tool.createFollowupTask',
      fallback: 'Create follow-up task',
    });
    expect(aiActionLabel('tool_call', 'analyze_customer_risk({"customerId":1})')).toEqual({
      key: 'ai.tool.analyzeCustomerRisk',
      fallback: 'Analyze customer risk',
    });
    // Tool: 前缀格式也兼容
    expect(aiActionLabel('tool_call', 'Tool: create_todo')).toEqual({
      key: 'ai.tool.createTodo',
      fallback: 'Create todo',
    });
  });

  it('detail 含未映射工具名 → action 标签附加原始工具名', () => {
    expect(aiActionLabel('tool_call', 'Tool: weird_tool_xyz')).toEqual({
      key: 'ai.toolCall',
      fallback: 'AI · Tool call · weird_tool_xyz',
    });
  });

  it('未知 action → 兜底 key/fallback', () => {
    expect(aiActionLabel('custom_event')).toEqual({ key: 'ai.custom_event', fallback: 'AI · custom_event' });
  });

  it('detail 无工具名 → 保持基础标签', () => {
    expect(aiActionLabel('chat', '回答用户问题')).toEqual({ key: 'ai.chat', fallback: 'AI · Chat' });
  });
});
