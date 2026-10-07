// SPDX-License-Identifier: Apache-2.0

/**
 * 创建标签工具 — create_tag（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: tag）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface TagsServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateTagTool implements AiTool {
  readonly name = 'create_tag';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建标签（name）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'name', type: 'string', description: 'name', required: false },
  ];

  constructor(private readonly tagsService: TagsServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'name' },
          },
          required: [],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.name !== undefined) dto.name = args.name as any;
      const entity = await this.tagsService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, name: entity.name } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
