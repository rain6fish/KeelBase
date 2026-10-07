// SPDX-License-Identifier: Apache-2.0

/**
 * 创建笔记工具 — create_note（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: note）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface NotesServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateNoteTool implements AiTool {
  readonly name = 'create_note';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建笔记（title、content、category）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'title', type: 'string', description: 'title', required: true },
    { name: 'content', type: 'string', description: 'content', required: false },
    { name: 'category', type: 'string', description: 'category', required: false,
      enum: ['work', 'personal', 'idea', 'archive'] },
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
            category: { type: 'string', description: 'category', enum: ['work', 'personal', 'idea', 'archive'] },
          },
          required: ['title'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.title !== undefined) dto.title = args.title as any;
        if (args.content !== undefined) dto.content = args.content as any;
        if (args.category !== undefined) dto.category = args.category as any;
      const entity = await this.notesService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, title: entity.title } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
