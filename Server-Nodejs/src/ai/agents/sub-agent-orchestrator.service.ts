/**
 * 子代理编排器 — SubAgentOrchestrator
 *
 * 把复杂请求分解为子代理任务（技能命中用固定组合，否则 LLM 分解），
 * 顺序执行（后续任务能看到先前结果），聚合结果交回主线程做总结 + 反思。
 *
 * 子代理只读：写工具泄漏进工具集时拒绝执行。plain class，由 useFactory 手动组合。
 */

import { LlmProvider, ChatMessage, ToolCall } from '../interfaces/llm-provider.interface';
import { ToolDefinition } from '../interfaces/tool.interface';
import { ToolRegistry } from '../tools/tool-registry';
import { SkillsRegistry } from '../skills/skills-registry';
import { SkillDefinition } from '../skills/skill.interface';
import { SUB_AGENTS, SUB_AGENT_NAMES, SubAgentDefinition } from './sub-agent.types';

export interface SubAgentTask {
  subAgent: string;
  query: string;
}

export interface SubAgentOrchestratorResult {
  content: string;
  stepResults: string[];
  usedSkill?: string;
}

const MAX_SUBAGENT_TOOL_ROUNDS = 3;
const MAX_DECOMPOSE_TASKS = 5;

const DECOMPOSITION_PROMPT = `你是任务分解器。把用户的复杂请求拆分成多个子任务，交给不同的子代理执行，最后汇总。
可用的子代理：
- calendar：日程/事件助手，工具：query_events、count_events_by_status、query_events_by_keyword
- stats：统计/洞察助手，工具：count_events_by_status、get_user_stats
- organizer：安排/规划助手，工具：query_events、count_events_by_status、query_events_by_keyword

只返回 JSON，不要任何其他文字，格式：
{"tasks":[{"subAgent":"calendar","query":"给该子代理的具体问题"}]}
要求：
- 最多 ${MAX_DECOMPOSE_TASKS} 个任务
- 任务按顺序执行，后面的任务可以看到前面的结果，所以查询问题可以依赖前面
- 子代理名必须从上面列表选`;

export class SubAgentOrchestrator {
  constructor(private readonly skillsRegistry: SkillsRegistry) {
    // 断言所有子代理工具集都是只读
    for (const agent of Object.values(SUB_AGENTS)) {
      for (const tool of agent.tools) {
        if (tool === 'create_event' || tool === 'create_todo') {
          throw new Error(`Sub-agent "${agent.name}" contains write tool "${tool}"`);
        }
      }
    }
  }

  matchSkill(request: string): SkillDefinition | null {
    return this.skillsRegistry.match(request);
  }

  async run(params: {
    messages: ChatMessage[];
    userRequest: string;
    provider: LlmProvider;
    toolRegistry: ToolRegistry;
    userId: string;
    model?: string;
  }): Promise<SubAgentOrchestratorResult> {
    // 1. 技能命中 → 固定任务组合；否则 LLM 分解
    const skill = this.skillsRegistry.match(params.userRequest);
    let tasks: SubAgentTask[];
    if (skill) {
      tasks = skill.tasks;
    } else {
      tasks = await this.decompose(params);
      if (tasks.length === 0) {
        return { content: '', stepResults: [] };
      }
    }

    // 2. 顺序执行，后续任务注入先前结果
    const stepResults: string[] = [];
    const priorResults: string[] = [];
    for (const task of tasks) {
      const agent = SUB_AGENTS[task.subAgent];
      if (!agent) {
        stepResults.push(`ERROR: unknown sub-agent "${task.subAgent}"`);
        priorResults.push(`[${task.subAgent}] ERROR: unknown sub-agent`);
        continue;
      }
      const result = await this.runSubAgentLoop(agent, task, priorResults, params);
      stepResults.push(result);
      priorResults.push(`[${task.subAgent}] ${result}`);
    }

    if (stepResults.length === 0) {
      return { content: '', stepResults: [] };
    }

    // 3. 聚合
    const content = stepResults
      .map((r, i) => `步骤 ${i + 1}（${tasks[i]?.subAgent ?? '?'}）: ${tasks[i]?.query ?? ''}\n结果: ${r}`)
      .join('\n\n');

    return { content, stepResults, usedSkill: skill?.name };
  }

  private async decompose(params: {
    messages: ChatMessage[];
    userRequest: string;
    provider: LlmProvider;
    model?: string;
  }): Promise<SubAgentTask[]> {
    try {
      const result = await params.provider.generate({
        messages: [
          ...params.messages.slice(0, 1),
          { role: 'user', content: `${DECOMPOSITION_PROMPT}\n\n用户请求：${params.userRequest}` },
        ],
        model: params.model ?? params.provider.availableModels[0],
        maxTokens: 1024,
        temperature: 0.2,
      });
      const stripped = result.content.replace(/```(?:json)?/g, '').trim();
      const parsed = JSON.parse(stripped);
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) return [];
      const tasks = parsed.tasks
        .filter((t: any) => t && typeof t.subAgent === 'string' && typeof t.query === 'string')
        .map((t: any) => ({ subAgent: t.subAgent, query: t.query }))
        .filter((t: SubAgentTask) => SUB_AGENT_NAMES.includes(t.subAgent));
      return tasks.slice(0, MAX_DECOMPOSE_TASKS);
    } catch {
      return [];
    }
  }

  private async runSubAgentLoop(
    agent: SubAgentDefinition,
    task: SubAgentTask,
    priorResults: string[],
    params: {
      provider: LlmProvider;
      toolRegistry: ToolRegistry;
      userId: string;
      model?: string;
    },
  ): Promise<string> {
    const messages: ChatMessage[] = [{ role: 'system', content: agent.systemPrompt }];
    if (priorResults.length > 0) {
      messages.push({
        role: 'system',
        content: `以下是之前子代理已获取的结果（供参考，无需重复查询）：\n${priorResults.join('\n')}`,
      });
    }
    messages.push({ role: 'user', content: task.query });

    const toolDefs = this.filterToolDefs(agent.tools, params.toolRegistry);

    for (let round = 0; round < MAX_SUBAGENT_TOOL_ROUNDS; round++) {
      let result;
      try {
        result = await params.provider.generate({
          messages,
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          model: params.model ?? params.provider.availableModels[0],
        });
      } catch {
        return 'ERROR: 子代理执行失败';
      }

      if (!result.toolCalls || result.toolCalls.length === 0) {
        return result.content || '';
      }

      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls,
      });

      for (const tc of result.toolCalls) {
        const toolResult = await this.executeSafe(tc, agent, params);
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult),
          tool_call_id: tc.id,
        });
      }
    }

    return '子代理执行超出最大轮数';
  }

  private async executeSafe(
    tc: ToolCall,
    agent: SubAgentDefinition,
    params: { provider: LlmProvider; toolRegistry: ToolRegistry; userId: string; model?: string },
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    // 安全守卫：只允许该子代理工具集内的只读工具
    if (!agent.tools.includes(tc.name) || params.toolRegistry.requiresConfirmation(tc.name)) {
      return { success: false, error: `Tool "${tc.name}" not allowed for sub-agent "${agent.name}"` };
    }
    try {
      const args = JSON.parse(tc.arguments);
      return await params.toolRegistry.execute(tc.name, args, params.userId);
    } catch {
      return { success: false, error: `Failed to execute tool "${tc.name}"` };
    }
  }

  private filterToolDefs(toolNames: string[], toolRegistry: ToolRegistry): ToolDefinition[] {
    const all = toolRegistry.getAllTools();
    return all
      .filter((t) => toolNames.includes(t.name))
      .map((t) => t.toToolDefinition());
  }
}
