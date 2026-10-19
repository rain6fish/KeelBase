// SPDX-License-Identifier: Apache-2.0

/**
 * 创建库存出入库工具 — create_inventory_movement（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: inventory_movement）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface InventoryMovementsServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateInventoryMovementTool implements AiTool {
  readonly name = 'create_inventory_movement';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建库存出入库（单据号、商品编码、商品名称、出入库方向、数量、单位、往来单位、业务日期、备注）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'documentNo', type: 'string', description: '单据号', required: true },
    { name: 'sku', type: 'string', description: '商品编码', required: true },
    { name: 'itemName', type: 'string', description: '商品名称', required: true },
    { name: 'direction', type: 'string', description: '出入库方向', required: true,
      enum: ['in', 'out'] },
    { name: 'quantity', type: 'number', description: '数量', required: true },
    { name: 'unit', type: 'string', description: '单位', required: false },
    { name: 'partner', type: 'string', description: '往来单位', required: false },
    { name: 'occurredAt', type: 'string', description: '业务日期', required: false },
    { name: 'note', type: 'string', description: '备注', required: false },
  ];

  constructor(private readonly inventory_movementsService: InventoryMovementsServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            documentNo: { type: 'string', description: '单据号' },
            sku: { type: 'string', description: '商品编码' },
            itemName: { type: 'string', description: '商品名称' },
            direction: { type: 'string', description: '出入库方向', enum: ['in', 'out'] },
            quantity: { type: 'number', description: '数量' },
            unit: { type: 'string', description: '单位' },
            partner: { type: 'string', description: '往来单位' },
            occurredAt: { type: 'string', description: '业务日期' },
            note: { type: 'string', description: '备注' },
          },
          required: ['documentNo', 'sku', 'itemName', 'direction', 'quantity'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.documentNo !== undefined) dto.documentNo = args.documentNo as any;
        if (args.sku !== undefined) dto.sku = args.sku as any;
        if (args.itemName !== undefined) dto.itemName = args.itemName as any;
        if (args.direction !== undefined) dto.direction = args.direction as any;
        if (args.quantity !== undefined) dto.quantity = args.quantity as any;
        if (args.unit !== undefined) dto.unit = args.unit as any;
        if (args.partner !== undefined) dto.partner = args.partner as any;
        if (args.occurredAt !== undefined) dto.occurredAt = args.occurredAt as any;
        if (args.note !== undefined) dto.note = args.note as any;
      const entity = await this.inventory_movementsService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, documentNo: entity.documentNo } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
