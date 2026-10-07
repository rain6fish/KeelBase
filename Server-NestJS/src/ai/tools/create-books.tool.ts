// SPDX-License-Identifier: Apache-2.0

/**
 * 创建图书工具 — create_book（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: book）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface BooksServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateBookTool implements AiTool {
  readonly name = 'create_book';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建图书（title、author、status、rating）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'title', type: 'string', description: 'title', required: true },
    { name: 'author', type: 'string', description: 'author', required: false },
    { name: 'status', type: 'string', description: 'status', required: false,
      enum: ['unread', 'reading', 'finished'] },
    { name: 'rating', type: 'number', description: 'rating', required: false },
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
            status: { type: 'string', description: 'status', enum: ['unread', 'reading', 'finished'] },
            rating: { type: 'number', description: 'rating' },
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
        if (args.author !== undefined) dto.author = args.author as any;
        if (args.status !== undefined) dto.status = args.status as any;
        if (args.rating !== undefined) dto.rating = args.rating as any;
      const entity = await this.booksService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, title: entity.title } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
