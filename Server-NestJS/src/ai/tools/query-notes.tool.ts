// SPDX-License-Identifier: Apache-2.0

/**
 * 查询笔记工具 — query_notes（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface NotesServiceLike {
  findAll(userId: number): Promise<any[]>;
}

export class QueryNotesTool implements AiTool {
  readonly name = 'query_notes';
  readonly description = '查询笔记列表（本人数据）。用户问"有哪些笔记"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly notesService: NotesServiceLike) {}

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
              category: { type: 'string', description: 'category' },
                },
              },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const items = await this.notesService.findAll(Number(userId));
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.title = item.title;
        o.content = item.content;
        o.category = item.category;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
