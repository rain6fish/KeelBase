// SPDX-License-Identifier: Apache-2.0

/**
 * EASY-2 AI 工具模板（第 11-12 周）：生成模块自动附带 AI 工具，
 * 让 Runtime Agent 能安全调用生成模块（P0-13 验收的 AI Tool 环节）。
 * - query_<plural>：只读，按 userId 过滤本人数据
 * - create_<singular>：写，requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）
 * 固定安全接线：写工具确认 + 审计由 AiService 统一处理，工具只需返回 data.id。
 */

import { aiToolsFlags, searchableFieldNames } from './validate.mjs';

/** create 工具风险级/确认声明（Protocol 2.0）：缺省 R3 + 需确认；R1/R2 不强制确认；显式覆盖优先。 */
function createToolMeta(ctx) {
  const c = ctx.aiTools && typeof ctx.aiTools.create === 'object' ? ctx.aiTools.create : {};
  const riskLevel = c.riskLevel || 'R3';
  const confirm = c.requiresConfirmation !== undefined ? c.requiresConfirmation : ['R3', 'R4'].includes(riskLevel);
  return { riskLevel, confirm };
}

/**
 * The query tool's one declared filter. It is built once and emitted into both faces — the
 * `parameters` array the runtime validates, and the JSON schema the model is shown. Two faces
 * rendered from one value cannot steer the model toward an argument the tool never reads.
 *
 * 查询工具唯一声明的过滤器。它只构造一次，分别发射到两个面 —— 运行时校验用的 `parameters`
 * 数组，以及给模型看的 JSON schema。同一个值渲染出的两个面，不可能把模型引向一个工具从不读取的参数。
 */
const QUERY_FILTER = { name: 'keyword', type: 'string', description: '关键字（可选）', required: false };

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
  const q = ctx.aiTools && typeof ctx.aiTools.query === 'object' ? ctx.aiTools.query : {};
  const riskLine = q.riskLevel ? `  readonly riskLevel = '${q.riskLevel}';\n` : '';
  // The filter exists only when the service can honour it. The service template emits `q` from this
  // same function, so the tool and the list endpoint agree by construction rather than by convention.
  // 只有当 service 能兑现过滤时，工具才声明它。service 模板用**同一个函数**决定是否发射 `q`，
  // 故工具与列表端点按构造一致，而不是靠约定一致。
  const filterable = searchableFieldNames(ctx.fields).length > 0;
  const serviceSignature = filterable ? 'findAll(userId: number, q?: string): Promise<any[]>;' : 'findAll(userId: number): Promise<any[]>;';
  const parametersLiteral = filterable
    ? `[\n    { name: '${QUERY_FILTER.name}', type: '${QUERY_FILTER.type}', description: '${QUERY_FILTER.description}', required: ${QUERY_FILTER.required} },\n  ]`
    : `[]`;
  const schemaLiteral = filterable
    ? `{\n          type: 'object',\n          properties: {\n            ${QUERY_FILTER.name}: { type: '${QUERY_FILTER.type}', description: '${QUERY_FILTER.description}' },\n          },\n        }`
    : `{ type: 'object', properties: {} }`;
  const executeRead = filterable
    ? `      const keyword = typeof args.keyword === 'string' ? args.keyword : undefined;\n      const items = await this.${ctx.plural}Service.findAll(Number(userId), keyword);`
    : `      const items = await this.${ctx.plural}Service.findAll(Number(userId));`;
  return `/**
 * 查询${ctx.label}工具 — query_${ctx.plural}（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ${ctx.pluralPascal}ServiceLike {
  ${serviceSignature}
}

export class Query${ctx.pluralPascal}Tool implements AiTool {
  readonly name = 'query_${ctx.plural}';
${riskLine}  readonly description = '查询${ctx.label}列表（本人数据）。用户问"有哪些${ctx.label}"时使用。';
  readonly parameters: ToolParameter[] = ${parametersLiteral};

  constructor(private readonly ${ctx.plural}Service: ${ctx.pluralPascal}ServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: ${schemaLiteral},
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
${executeRead}
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
  const { riskLevel: createRisk, confirm: createConfirm } = createToolMeta(ctx);
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
${createRisk ? `  readonly riskLevel = '${createRisk}';\n` : ''}${createConfirm ? '  readonly requiresConfirmation = true;\n' : ''}  readonly permissions = { requireVerifiedEmail: true };
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
  const filterable = searchableFieldNames(ctx.fields).length > 0;
  const unfilteredCallArg = filterable ? ', undefined' : '';
  // The assertion goes through `execute`, not around it: a filter that the tool *declares* but never
  // forwards is exactly the defect this pins, and it is invisible to a schema-shape check alone.
  // 断言走 `execute`，不是绕开它：工具**声明**了过滤却从不转交，正是这里要钉住的缺陷，
  // 而只看 schema 形状是看不见它的。
  const filterTest = filterable
    ? `  it('should declare the same filter to the runtime and the model', () => {
    const def = tool.toToolDefinition();
    expect(Object.keys((def.function.parameters as any).properties)).toEqual(['keyword']);
    expect(tool.parameters.map((p) => p.name)).toEqual(['keyword']);
  });

  it('should pass the declared keyword filter through and narrow the result', async () => {
    mockService.findAll.mockImplementation((_userId: number, q?: string) =>
      Promise.resolve(q
        ? [${itemLiteral}]
        : [${itemLiteral}, { id: 2${firstField ? `, ${firstField}: 'other'` : ''} }]),
    );

    const unfiltered = await tool.execute({}, '7');
    const filtered = await tool.execute({ keyword: 'sample' }, '7');

    expect(mockService.findAll).toHaveBeenNthCalledWith(1, 7, undefined);
    expect(mockService.findAll).toHaveBeenNthCalledWith(2, 7, 'sample');
    expect((filtered.data as any[]).length).toBeLessThan((unfiltered.data as any[]).length);
  });`
    : `  it('should declare no filter and ignore one if passed', async () => {
    const def = tool.toToolDefinition();
    expect(def.function.parameters).toEqual({ type: 'object', properties: {} });
    expect(tool.parameters).toEqual([]);

    mockService.findAll.mockResolvedValue([${itemLiteral}]);
    await tool.execute({ keyword: 'anything' }, '7');

    expect(mockService.findAll).toHaveBeenCalledWith(7);
  });`;
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

    expect(mockService.findAll).toHaveBeenCalledWith(7${unfilteredCallArg});
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

${filterTest}
});
`;
}

export function createToolSpecTemplate(ctx) {
  const { riskLevel: createRisk, confirm: createConfirm } = createToolMeta(ctx);
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

  it('should have name and ${createConfirm ? 'require confirmation' : 'risk level'} + verified email', () => {
    const tool = new Create${ctx.singlePascal}Tool(mockService as any);
    expect(tool.name).toBe('create_${ctx.singular}');
${createConfirm ? `    expect(tool.requiresConfirmation).toBe(true);` : `    expect(tool.riskLevel).toBe('${createRisk}');`}
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

/** 全部 AI 工具文件：{ relativePath, content }。按 ctx.aiTools 声明开关（Protocol 2.0）。 */
export function aiFiles(ctx) {
  const flags = aiToolsFlags(ctx.aiTools);
  const files = [];
  if (flags.query) {
    files.push(
      { path: `ai/tools/query-${ctx.plural}.tool.ts`, content: queryToolTemplate(ctx) },
      { path: `ai/tools/query-${ctx.plural}.tool.spec.ts`, content: queryToolSpecTemplate(ctx) },
    );
  }
  if (flags.create) {
    files.push(
      { path: `ai/tools/create-${ctx.plural}.tool.ts`, content: createToolTemplate(ctx) },
      { path: `ai/tools/create-${ctx.plural}.tool.spec.ts`, content: createToolSpecTemplate(ctx) },
    );
  }
  return files;
}
