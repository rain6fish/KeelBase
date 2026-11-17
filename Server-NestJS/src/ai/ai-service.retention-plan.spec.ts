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

  it('失败的步骤不进渲染：汇总模型看到的是 ERROR 文本，留存不记 rendered', async () => {
    const capture = jest.fn().mockResolvedValue(undefined);
    (aiService as any).toolResultRetention = { capture };
    (aiService as any).routerAgent = {
      classify: jest.fn().mockResolvedValue({ intent: 'plan' }),
    };

    const failure: ToolResult = { success: false, error: '联系人 alice@example.com 不存在' };
    jest.spyOn(toolExecution, 'executeAgentRead').mockResolvedValue(failure);
    (mockAuditService.log as jest.Mock).mockResolvedValue({ id: 556 });

    mockProvider.generate
      .mockResolvedValueOnce({
        content: JSON.stringify([{ description: '查联系人', tool: 'query_events', args: {} }]),
      })
      .mockResolvedValue({ content: '汇总回答' });

    await aiService.chat('1', { message: '帮我做个计划' });

    // 汇总模型看到的是 `ERROR: <脱敏后的错误>`，不是 renderToolResult 的投影
    const summaryCall = mockProvider.generate.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes('以下是数据查询结果'),
    );
    expect(summaryCall).toBeTruthy();
    const prompt = JSON.stringify(summaryCall![0]);
    expect(prompt).toContain('ERROR:');
    expect(prompt).not.toContain('alice@example.com');

    // 模型没收到那份渲染 ⇒ model_text 必须为 null，不能记一份没有模型见过的文本
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0].rendered).toBeUndefined();
  });

  it('渲染抛错不影响工具调用：capture 照常执行，rendered 缺席', async () => {
    const capture = jest.fn().mockResolvedValue(undefined);
    (aiService as any).toolResultRetention = { capture };
    (aiService as any).routerAgent = {
      classify: jest.fn().mockResolvedValue({ intent: 'plan' }),
    };

    const result: ToolResult = { success: true, data: { email: 'alice@example.com' } };
    jest.spyOn(toolExecution, 'executeAgentRead').mockResolvedValue(result);
    (mockAuditService.log as jest.Mock).mockResolvedValue({ id: 557 });
    jest.spyOn(presentation, 'renderToolResult').mockImplementation(() => {
      throw new Error('render exploded');
    });

    mockProvider.generate
      .mockResolvedValueOnce({
        content: JSON.stringify([{ description: '查联系人', tool: 'query_events', args: {} }]),
      })
      .mockResolvedValue({ content: '汇总回答' });

    // 留存是证据不是闸：渲染失败不得让这次对话失败
    await expect(aiService.chat('1', { message: '帮我做个计划' })).resolves.toBeDefined();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0].rendered).toBeUndefined();
  });
});
