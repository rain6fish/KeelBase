// SPDX-License-Identifier: Apache-2.0

import {
  aiService,
  installAiServiceTestbed,
  mockAuditService,
  mockProvider,
  mockSubAgentOrchestrator,
  presentation,
  toolExecution,
} from '../../test/ai-service.testbed';
import { ToolResult } from './interfaces/tool.interface';

beforeEach(installAiServiceTestbed);

/**
 * L1: on the plan / sub-agent paths `capture` used to be called without `rendered`, so `model_text`
 * stayed null even on the sub-agent path — where the orchestrator does hand the model exactly
 * `renderToolResult(result).text` (F1), and `was_truncated` described a projection no model saw.
 * The sub-agent path now passes that rendering; paths with no model in the loop still pass nothing.
 *
 * L1：plan / 子代理路径原先调 `capture` 时不传 `rendered`，于是即便子代理确实把
 * `renderToolResult(result).text` 交给了模型（F1），`model_text` 仍为 null，`was_truncated` 也描述的
 * 是一份没有模型见过的投影。现在子代理路径传这份渲染；没有模型参与结果的路径仍不传。
 */
describe('AiService › 子代理路径的 model_text（L1）', () => {
  function installRetentionCapture(): jest.Mock {
    const capture = jest.fn().mockResolvedValue(undefined);
    // 与既有 governance spec 同法：可选依赖直挂到实例上，避免改共享 testbed。
    (aiService as any).toolResultRetention = { capture };
    return capture;
  }

  it('子代理路径：留存记下的就是编排器交给模型的那份渲染', async () => {
    const capture = installRetentionCapture();
    const result: ToolResult = { success: true, data: { email: 'alice@example.com' } };
    jest.spyOn(toolExecution, 'executeAgentRead').mockResolvedValue(result);
    (mockAuditService.log as jest.Mock).mockResolvedValue({ id: 777 });

    mockSubAgentOrchestrator.matchSkill.mockReturnValue({ name: 'week-plan' });
    mockSubAgentOrchestrator.run.mockImplementation(async (params: any) => {
      // 真编排器在工具结果上就是调 renderToolResult(...).text 再推给模型
      await params.readOnlyExecutor('query_customers', {}, '1');
      return { content: 'done', stepResults: ['x'] };
    });
    mockProvider.generate.mockResolvedValue({ content: '已为你安排本周' });

    await aiService.chat('1', { message: '帮我安排本周' });

    expect(capture).toHaveBeenCalledTimes(1);
    const input = capture.mock.calls[0][0];
    expect(input.auditRowId).toBe(777);
    // 与编排器同一份确定性渲染 ⇒ model_text 即模型实收，was_truncated 也出自同一投影
    expect(input.rendered).toEqual(presentation.renderToolResult(result));
    expect(input.rendered.text).toBe(presentation.renderToolResult(result).text);
  });

  it('确定性导航：没有模型看到结果，不记 model_text', async () => {
    const capture = installRetentionCapture();
    jest.spyOn(toolExecution, 'executeAgentRead').mockResolvedValue({ success: true, data: {} });
    (mockAuditService.log as jest.Mock).mockResolvedValue({ id: 9 });

    await aiService.chat('1', { message: '打开设置' });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0].rendered).toBeUndefined();
  });
});
