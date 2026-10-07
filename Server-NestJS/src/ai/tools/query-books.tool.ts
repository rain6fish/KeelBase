// SPDX-License-Identifier: Apache-2.0

/**
 * 查询图书工具 — query_books（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface BooksServiceLike {
  findAll(userId: number): Promise<any[]>;
}

export class QueryBooksTool implements AiTool {
  readonly name = 'query_books';
  readonly description = '查询图书列表（本人数据）。用户问"有哪些图书"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly booksService: BooksServiceLike) {}

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
              author: { type: 'string', description: 'author' },
              status: { type: 'string', description: 'status' },
              rating: { type: 'number', description: 'rating' },
                },
              },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const items = await this.booksService.findAll(Number(userId));
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.title = item.title;
        o.author = item.author;
        o.status = item.status;
        o.rating = item.rating;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
