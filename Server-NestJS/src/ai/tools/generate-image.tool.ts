/**
 * 图像生成工具 — generate_image（AI-12.1）
 *
 * 调用默认 LLM provider 的 OpenAI 兼容 /images/generations 生成图片。
 * provider 不支持或失败时返回 success:false（LLM 引导用户，不崩）。
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';
import { LlmProviderFactory } from '../providers/provider-factory';

export class GenerateImageTool implements AiTool {
  readonly name = 'generate_image';
  readonly description =
    '生成图片（根据文字描述创建图像）。当用户要求"画一张/生成图片/做一张图"时使用。';
  readonly permissions = { featureFlag: 'ai' };
  readonly parameters: ToolParameter[] = [
    {
      name: 'prompt',
      type: 'string',
      description: '图片内容描述（英文效果更佳，中文也可）',
      required: true,
    },
    {
      name: 'size',
      type: 'string',
      description: '图片尺寸，默认 1024x1024',
      required: false,
    },
  ];

  constructor(
    private readonly providerFactory: LlmProviderFactory,
    private readonly defaultProvider: string,
  ) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: '图片内容描述' },
            size: { type: 'string', enum: ['512x512', '1024x1024', '1024x1792'], description: '尺寸' },
          },
          required: ['prompt'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const prompt = String(args.prompt ?? '').trim();
    if (!prompt) {
      return { success: false, error: '图片描述不能为空' };
    }
    try {
      // 用默认 provider 生成（deepseek/qwen 可能不支持 images，失败时返回错误由 LLM 说明）
      const provider = this.providerFactory.getProvider(this.defaultProvider);
      if (!('generateImage' in provider)) {
        return { success: false, error: '当前模型不支持图像生成' };
      }
      const url = await (provider as unknown as { generateImage: (p: string, s?: string) => Promise<string> })
        .generateImage(prompt, String(args.size ?? '1024x1024'));
      return { success: true, data: { url } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
