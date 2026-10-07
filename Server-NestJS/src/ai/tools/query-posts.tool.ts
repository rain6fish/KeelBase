// SPDX-License-Identifier: Apache-2.0

/**
 * 查询帖子工具 — query_posts（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface PostsServiceLike {
  findAll(userId: number): Promise<any[]>;
}

export class QueryPostsTool implements AiTool {
  readonly name = 'query_posts';
  readonly description = '查询帖子列表（本人数据）。用户问"有哪些帖子"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly postsService: PostsServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
                type: 'object',
                properties: {
              title: { type: 'string', description: 'title' },
              content: { type: 'string', description: 'content' },
                },
              },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const items = await this.postsService.findAll(Number(userId));
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.title = item.title;
        o.content = item.content;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
