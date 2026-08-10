/**
 * 联网搜索工具 — web_search（AI-14）
 *
 * 封装 Tavily Search API（也可换 Serper 等），解决通用知识类问题准确性。
 * 未配置 TAVILY_API_KEY 时返回 success:false + 提示（LLM 引导用户，不崩）。
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';
import { ConfigService } from '@nestjs/config';

interface TavilyResponse {
  results?: Array<{ title: string; url: string; content: string }>;
}

export class WebSearchTool implements AiTool {
  readonly name = 'web_search';
  readonly description =
    '联网搜索公开信息（新闻/知识/天气/百科等通用问题）。当用户问题涉及实时或外部信息时使用。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'query',
      type: 'string',
      description: '搜索关键词（简洁），如 "2026 年北京马拉松"',
      required: true,
    },
    {
      name: 'limit',
      type: 'number',
      description: '返回结果条数，默认 5',
      required: false,
    },
  ];

  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('TAVILY_API_KEY', '');
    this.baseURL = configService.get<string>('TAVILY_BASE_URL', 'https://api.tavily.com/search');
  }

  get enabled(): boolean {
    return !!this.apiKey;
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            limit: { type: 'number', description: '结果条数，默认 5' },
          },
          required: ['query'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return { success: false, error: '搜索关键词不能为空' };
    }
    if (!this.enabled) {
      return { success: false, error: '联网搜索未配置，请使用内置工具回答' };
    }
    const limit = Math.min((args.limit as number) ?? 5, 10);

    try {
      const res = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query, max_results: limit }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => 'Unknown error');
        return { success: false, error: `搜索服务错误: ${res.status} ${body.slice(0, 200)}` };
      }
      const data = (await res.json()) as TavilyResponse;
      const results = (data.results ?? []).slice(0, limit).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 300),
      }));
      if (results.length === 0) {
        return { success: true, data: { results: [], message: '未找到相关结果' } };
      }
      return { success: true, data: { results } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
