import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProviderFactory } from '../ai/providers/provider-factory';
import { validateFlowDefinition } from './flow-definition.schema';
import { FlowDefinition as FlowDef } from './flow-definition.types';

/**
 * FLOW-5：AI 生成流程定义（「AI 按系统约定生成」在流程域落地）。
 * 自然语言 → LLM 按 flow schema 产出 JSON → 校验 → 返回预览（人工确认后经 POST /flows/definitions 发布）。
 */
@Injectable()
export class AiFlowService {
  constructor(
    private readonly providerFactory: LlmProviderFactory,
    private readonly configService: ConfigService,
  ) {}

  private readonly SYSTEM_PROMPT = `你是 KeelBase 工作流设计助手。根据用户需求，输出一个工作流流程定义 JSON（严格符合格式，只输出 JSON 不要多余文字）。
节点类型：
- human_task 人工审批节点：{ id, type:"human_task", name, roles?:["user"|"admin"], next? }
- ai_task AI 处理节点：{ id, type:"ai_task", name, prompt, outputKey?, next? }
- condition 条件分支：{ id, type:"condition", name, expr:"{{field}} > N" 或 "{{field}} == \\"值\\"", then, else }
流程 JSON 形态：
{ "id": "小写snake_case英文", "name": "中文名", "version": "1.0", "nodes": [首个节点开始，依次串联], "security": {"audit": true} }
规则：节点 id 唯一；condition 的 then/else 必须引用存在的节点 id；human_task 无 next 表示流程结束；审批场景给审批节点配 roles（如 ["admin"]）。`;

  async generateFromDescription(
    description: string,
  ): Promise<{ ok: boolean; definition?: FlowDef; error?: string }> {
    const providerName = this.configService.get<string>('AI_PROVIDER', 'deepseek');
    const provider = this.providerFactory.getProvider(providerName);
    try {
      const res = await provider.generate({
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: description },
        ],
        model: provider.availableModels[0] ?? 'deepseek-chat',
      });
      const json = extractFlowJson(res.content);
      const parsed = JSON.parse(json) as FlowDef;
      const valid = validateFlowDefinition(parsed);
      if (!valid.ok) return { ok: false, error: valid.error };
      return { ok: true, definition: parsed };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}

/** 从 LLM 输出提取 JSON（容忍 ```json 围栏与前后杂文）。 */
function extractFlowJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : content;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}
