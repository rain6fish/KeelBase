import { aiActionLabel } from './ai-feature-map';

describe('aiActionLabel（D2 人类语言审计标签）', () => {
  it('已知 action → 语义 key + fallback', () => {
    expect(aiActionLabel('chat')).toEqual({ key: 'ai.chat', fallback: 'AI · Chat' });
    expect(aiActionLabel('tool_call')).toEqual({ key: 'ai.toolCall', fallback: 'AI · Tool call' });
    expect(aiActionLabel('knowledge')).toEqual({ key: 'ai.knowledge', fallback: 'AI · Knowledge' });
  });

  it('detail 含工具名 → fallback 附加工具名（技术 action + 对象并显）', () => {
    expect(aiActionLabel('tool_call', 'Tool: create_followup_task')).toEqual({
      key: 'ai.toolCall',
      fallback: 'AI · Tool call · create_followup_task',
    });
    expect(aiActionLabel('tool_call', 'Tool: analyze_customer_risk')).toEqual({
      key: 'ai.toolCall',
      fallback: 'AI · Tool call · analyze_customer_risk',
    });
  });

  it('未知 action → 兜底 key/fallback', () => {
    expect(aiActionLabel('custom_event')).toEqual({ key: 'ai.custom_event', fallback: 'AI · custom_event' });
  });

  it('detail 无工具名 → 保持基础标签', () => {
    expect(aiActionLabel('chat', '回答用户问题')).toEqual({ key: 'ai.chat', fallback: 'AI · Chat' });
  });
});
