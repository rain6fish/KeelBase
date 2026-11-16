// SPDX-License-Identifier: Apache-2.0

import {
  aiService,
  installAiServiceTestbed,
  mockAuditService,
  mockProvider,
  presentation,
  toolExecution,
} from '../../test/ai-service.testbed';
import { ToolResult } from './interfaces/tool.interface';

beforeEach(installAiServiceTestbed);

/**
 * The plan path used to feed its summary model `JSON.stringify(result.data)` — no string-level
 * masking, no HS-5 truncation (the same class of gap F1 closed on the sub-agent path). It now goes
 * through `renderToolResult` like the chat paths, which also makes `model_text` truthful for it.
 *
 * plan 路径原先把 `JSON.stringify(result.data)` 直接喂给汇总模型 —— 没有字符串级脱敏、没有 HS-5
 * 截断（与 F1 在子代理路径上关掉的缺口同类）。现在它和对话路径一样走 `renderToolResult`，其
 * `model_text` 也因此变得属实。
 */
describe('AiService › plan 路径的脱敏与 model_text', () => {
  it('步骤结果进汇总提示词前过同一份渲染，留存记同一份 model_text', async () => {
    const capture = jest.fn().mockResolvedValue(undefined);
    (aiService as any).toolResultRetention = { capture };
    (aiService as any).routerAgent = {
      classify: jest.fn().mockResolvedValue({ intent: 'plan' }),
    };

    const result: ToolResult = { success: true, data: { email: 'alice@example.com' } };
    jest.spyOn(toolExecution, 'executeAgentRead').mockResolvedValue(result);
    (mockAuditService.log as jest.Mock).mockResolvedValue({ id: 555 });

    // 第一次 generate = 规划器；之后 = 汇总 / 反思
    mockProvider.generate
      .mockResolvedValueOnce({
        content: JSON.stringify([{ description: '查联系人', tool: 'query_events', args: {} }]),
      })
      .mockResolvedValue({ content: '汇总回答' });

    await aiService.chat('1', { message: '帮我做个计划' });

    // 汇总提示词里是渲染后的文本：邮箱已掩码，不再有明文
    const summaryCall = mockProvider.generate.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes('以下是数据查询结果'),
    );
    expect(summaryCall).toBeTruthy();
    const prompt = JSON.stringify(summaryCall![0]);
    expect(prompt).not.toContain('alice@example.com');
    expect(prompt).toContain('a***@example.com');

    // 留存记下的 model_text 就是这份渲染（plan 路径也传 modelSeesRendered）
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0].rendered).toEqual(presentation.renderToolResult(result));
  });
});
