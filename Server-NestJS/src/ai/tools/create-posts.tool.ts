// SPDX-License-Identifier: Apache-2.0

/**
 * 创建帖子工具 — create_post（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: post）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface PostsServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreatePostTool implements AiTool {
  readonly name = 'create_post';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建帖子（title、content）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'title', type: 'string', description: 'title', required: false },
    { name: 'content', type: 'string', description: 'content', required: false },
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
          required: [],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.title !== undefined) dto.title = args.title as any;
        if (args.content !== undefined) dto.content = args.content as any;
      const entity = await this.postsService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, title: entity.title } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
