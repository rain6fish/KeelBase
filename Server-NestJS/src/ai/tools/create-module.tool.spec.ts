import { CreateModuleTool } from './create-module.tool';

describe('CreateModuleTool（System AI L4 Act：dry-run 预览）', () => {
  let tool: CreateModuleTool;

  beforeEach(() => {
    tool = new CreateModuleTool();
  });

  it('元数据：adminOnly + R1（dry-run 无副作用，不需确认）', () => {
    expect(tool.name).toBe('create_module');
    expect(tool.permissions?.adminOnly).toBe(true);
    expect(tool.riskLevel).toBe('R1');
    expect(tool.requiresConfirmation).toBeFalsy(); // R1 不确认
  });

  it('dry-run 预览：返回生成模块定义 + 引导（不写文件）', async () => {
    const r = await tool.execute({ module: 'wipmod', label: 'WIP 模块', fields: 'title:string,note:text' });
    expect(r.success).toBe(true);
    const data = r.data as any;
    // 预览输出含模块定义（dry-run 不写文件）
    expect(data.output).toMatch(/wipmod|生成业务模块/);
    // 引导手动执行真实生成
    expect(data.note).toContain('node scripts/keelbase-init.mjs');
    // dry-run 不写任何文件
    expect(data.output).not.toMatch(/已写|生成成功/);
  });

  it('缺参数：提示需要 desc 或 module+label', async () => {
    const r = await tool.execute({});
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/--desc 自然语言描述，或 module \+ label/);
  });
});
