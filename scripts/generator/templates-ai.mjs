/**
 * EASY-2 AI 工具模板（第 11-12 周）：生成模块自动附带 AI 工具，
 * 让 Runtime Agent 能安全调用生成模块（P0-13 验收的 AI Tool 环节）。
 * - query_<plural>：只读，按 userId 过滤本人数据
 * - create_<singular>：写，requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）
 * 固定安全接线：写工具确认 + 审计由 AiService 统一处理，工具只需返回 data.id。
 */

/** 只读字段映射（不含 enum 之外的类型差异——读端统一返回原始值）。 */
function readParams(fields) {
  const props = fields
    .map((f) => `      ${f.name}: { type: '${f.type === 'int' ? 'number' : f.type === 'bool' ? 'boolean' : 'string'}', description: '${f.label ?? f.name}' },`)
    .join('\n');
  return `{
        type: 'object',
        properties: {
${props}
        },
      }`;
}

/** 写端 DTO 白名单读取行：data['<name>'] = args.<name>（仅非 undefined）。 */
function whitelistReads(fields) {
  return fields
    .map((f) => {
      const raw = `if (args.${f.name} !== undefined) dto.${f.name} = args.${f.name} as any;`;
      return `        ${raw}`;
    })
    .join('\n');
}

export function queryToolTemplate(ctx) {
  const fields = ctx.fields;
  const props = readParams(fields);
  return `/**
 * 查询${ctx.label}工具 — query_${ctx.plural}（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ${ctx.pluralPascal}ServiceLike {
  findAll(userId: number): Promise<any[]>;
}

export class Query${ctx.pluralPascal}Tool implements AiTool {
  readonly name = 'query_${ctx.plural}';
  readonly description = '查询${ctx.label}列表（本人数据）。用户问"有哪些${ctx.label}"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly ${ctx.plural}Service: ${ctx.pluralPascal}ServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: ${props.replace(/\n/g, '\n        ').replace(/^ {8}/, '')},
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const items = await this.${ctx.plural}Service.findAll(Number(userId));
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        ${ctx.fields.map((f) => `o.${f.name} = item.${f.name};`).join('\n        ')}
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
`;
}

export function createToolTemplate(ctx) {
  const titleField = ctx.fields.length > 0 ? ctx.fields[0].name : 'id';
  const params = ctx.fields.map((f) => ({
    name: f.name,
    type: f.type === 'int' ? 'number' : f.type === 'bool' ? 'boolean' : 'string',
    description: f.label ?? f.name,
    required: f.required === true,
    ...(f.type === 'enum' ? { enum: f.enum } : {}),
  }));
  const paramLines = params
    .map((p) =>
      `    { name: '${p.name}', type: '${p.type}', description: '${p.description}', required: ${p.required}${p.enum ? `,\n      enum: [${p.enum.map((o) => `'${o}'`).join(', ')}]` : ''} },`,
    )
    .join('\n');
  return `/**
 * 创建${ctx.label}工具 — create_${ctx.singular}（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: ${ctx.singular}）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ${ctx.pluralPascal}ServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class Create${ctx.singlePascal}Tool implements AiTool {
  readonly name = 'create_${ctx.singular}';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建${ctx.label}（${ctx.fields.map((f) => f.label ?? f.name).join('、')}）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
${paramLines}
  ];

  constructor(private readonly ${ctx.plural}Service: ${ctx.pluralPascal}ServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            ${ctx.fields.map((f) => `${f.name}: { type: '${f.type === 'int' ? 'number' : f.type === 'bool' ? 'boolean' : 'string'}', description: '${f.label ?? f.name}'${f.type === 'enum' ? `, enum: [${f.enum.map((o) => `'${o}'`).join(', ')}]` : ''} },`).join('\n            ')}
          },
          required: [${ctx.fields.filter((f) => f.required).map((f) => `'${f.name}'`).join(', ')}],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
${whitelistReads(ctx.fields)}
      const entity = await this.${ctx.plural}Service.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, ${titleField}: entity.${titleField} } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
`;
}

export function queryToolSpecTemplate(ctx) {
  const firstField = ctx.fields.length > 0 ? ctx.fields[0].name : null;
  const itemLiteral = firstField ? `{ id: 1, ${firstField}: 'sample' }` : '{ id: 1 }';
  return `import { Query${ctx.pluralPascal}Tool } from './query-${ctx.plural}.tool';

describe('Query${ctx.pluralPascal}Tool', () => {
  const mockService = { findAll: jest.fn() };

  let tool: Query${ctx.pluralPascal}Tool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new Query${ctx.pluralPascal}Tool(mockService as any);
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('query_${ctx.plural}');
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it('should build a valid tool definition', () => {
    const def = tool.toToolDefinition();
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('query_${ctx.plural}');
    expect(def.function.parameters).toBeDefined();
  });

  it('should fetch own ${ctx.plural} scoped by userId and map fields', async () => {
    mockService.findAll.mockResolvedValue([${itemLiteral}]);

    const result = await tool.execute({}, '7');

    expect(mockService.findAll).toHaveBeenCalledWith(7);
    expect(result.success).toBe(true);
    expect((result.data as any[])[0]).toMatchObject({ id: 1${firstField ? `, ${firstField}: 'sample'` : ''} });
  });

  it('should return empty data when none found', async () => {
    mockService.findAll.mockResolvedValue([]);

    const result = await tool.execute({}, '7');

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should handle service errors gracefully', async () => {
    mockService.findAll.mockRejectedValue(new Error('db down'));

    const result = await tool.execute({}, '7');

    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });
});
`;
}

export function createToolSpecTemplate(ctx) {
  const firstField = ctx.fields.length > 0 ? ctx.fields[0] : null;
  const mockData = firstField ? `{ id: 7, ${firstField.name}: 'sample' }` : '{ id: 7 }';
  const argsLiteral = firstField ? `{ ${firstField.name}: 'sample' }` : '{}';
  const expectDto = firstField
    ? `expect.objectContaining({ ${firstField.name}: 'sample' })`
    : 'expect.any(Object)';
  return `import { Create${ctx.singlePascal}Tool } from './create-${ctx.plural}.tool';

describe('Create${ctx.singlePascal}Tool', () => {
  const mockService = { create: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have name and require confirmation + verified email', () => {
    const tool = new Create${ctx.singlePascal}Tool(mockService as any);
    expect(tool.name).toBe('create_${ctx.singular}');
    expect(tool.requiresConfirmation).toBe(true);
    expect(tool.permissions.requireVerifiedEmail).toBe(true);
  });

  it('should build a valid tool definition', () => {
    const tool = new Create${ctx.singlePascal}Tool(mockService as any);
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('create_${ctx.singular}');
    expect(def.function.parameters).toBeDefined();
  });

  it('should create and return id + first field', async () => {
    mockService.create.mockResolvedValue(${mockData});
    const tool = new Create${ctx.singlePascal}Tool(mockService as any);

    const result = await tool.execute(${argsLiteral}, '1');

    expect(mockService.create).toHaveBeenCalledWith(${expectDto}, 1);
    expect(result).toEqual({ success: true, data: ${mockData} });
  });

  it('should return error when service throws', async () => {
    mockService.create.mockRejectedValue(new Error('boom'));
    const tool = new Create${ctx.singlePascal}Tool(mockService as any);

    const result = await tool.execute({}, '1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
`;
}

/** 全部 AI 工具文件：{ relativePath, content }。 */
export function aiFiles(ctx) {
  return [
    { path: `ai/tools/query-${ctx.plural}.tool.ts`, content: queryToolTemplate(ctx) },
    { path: `ai/tools/create-${ctx.plural}.tool.ts`, content: createToolTemplate(ctx) },
    { path: `ai/tools/query-${ctx.plural}.tool.spec.ts`, content: queryToolSpecTemplate(ctx) },
    { path: `ai/tools/create-${ctx.plural}.tool.spec.ts`, content: createToolSpecTemplate(ctx) },
  ];
}
