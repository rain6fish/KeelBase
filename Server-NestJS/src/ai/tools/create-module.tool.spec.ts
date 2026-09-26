// SPDX-License-Identifier: Apache-2.0

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
    // Asserted before `success`, deliberately: this spec spawns the real CLI, and the CLI statically
    // imports `scripts/generator/*.mjs`. While that tree is momentarily incoherent — another session
    // writing it, a checkout switching underneath — the child dies at import and `success: false` alone
    // says nothing about why. Asserting `error` first puts the CLI's own message into the failure output.
    //
    // 有意先断言 `error`：本 spec spawn 真 CLI，而 CLI 会静态 import `scripts/generator/*.mjs`。那棵树
    // 一时不成一体时——另一会话正在写它、或 checkout 在它下面切换——子进程会在 import 处就死掉，单看
    // `success: false` 完全看不出原因。先断言 `error` 能把 CLI 自己的报错带进失败输出。
    expect(r.error).toBeUndefined();
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
