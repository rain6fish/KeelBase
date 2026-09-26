// SPDX-License-Identifier: Apache-2.0

/**
 * `create_module_apply` — the write half.
 *
 * This one is not run for real here, and that is deliberate: `create_module`'s spec may spawn the CLI
 * because `--dry-run` writes nothing, while this tool's whole job is to write into the repository. So
 * the CLI is mocked and the assertions are about **what would be invoked** — which is where this tool's
 * two invariants live: it passes no `--dry-run`, and it passes no `--force` (the CLI's own guard against
 * overwriting a handwritten module stays armed). The CLI's own work is covered by its own tests.
 *
 * 本工具的 spec **不真跑**，这是有意的：`create_module` 的 spec 敢 spawn CLI 是因为 `--dry-run` 什么都不写，
 * 而这个工具的全部职责就是往仓库里写。故把 CLI 换成 mock，断言的落点是**它将要调用什么** —— 本工具的两条
 * 不变量正在那里：**不带 `--dry-run`**、**不带 `--force`**（CLI 那道「不覆盖手写模块」的守卫保持有效）。
 * CLI 自身的活儿由它自己的测试覆盖。
 *
 * Note on the mock: jest replaces `node:child_process`, which also drops the custom promisified
 * `execFile` Node attaches to it — so the mocked call resolves with the object the default
 * `util.promisify` would hand back (`{stdout}`), which is what the tool destructures.
 */
jest.mock('node:child_process', () => ({
  execFile: jest.fn((_file: string, _args: string[], _options: unknown, callback: Function) =>
    callback(null, { stdout: 'generated posts\n' }),
  ),
}));

import { execFile } from 'node:child_process';
import { CreateModuleApplyTool, cliArgsFor } from './create-module-apply.tool';

const execFileMock = execFile as unknown as jest.Mock;

describe('CreateModuleApplyTool（System AI L4 Act：真写那一半）', () => {
  beforeEach(() => {
    execFileMock.mockClear();
  });

  it('元数据：adminOnly + 需确认（派生 R3）+ 如实声明不可撤销', () => {
    const tool = new CreateModuleApplyTool();
    expect(tool.name).toBe('create_module_apply');
    expect(tool.permissions?.adminOnly).toBe(true);
    expect(tool.requiresConfirmation).toBe(true);
    // 未显式声明 riskLevel ⇒ 由 requiresConfirmation 派生 R3（写工具）
    expect(tool.riskLevel).toBeUndefined();
    // 不可撤销是**如实**声明，不是漏填：文件写入没有运行时回滚路径
    expect(tool.revokeClass).toBe('none');
  });

  it('参数构造：不带 --dry-run，也不带 --force', () => {
    const built = cliArgsFor({ module: 'posts', label: '文章', fields: 'title:string' });
    expect('args' in built && built.args).toEqual([
      '--module', 'posts', '--label', '文章', '--fields', 'title:string',
    ]);
    const joined = ('args' in built ? built.args : []).join(' ');
    expect(joined).not.toContain('--dry-run');
    expect(joined).not.toContain('--force');
  });

  it('desc 形式：走 --desc，同样不带 --dry-run', () => {
    const built = cliArgsFor({ desc: '图书管理，有书名作者价格' });
    expect('args' in built && built.args[0]).toBe('--desc');
    expect(('args' in built ? built.args : []).join(' ')).not.toContain('--dry-run');
  });

  it('缺参数：直接失败，且不调用 CLI', async () => {
    const r = await new CreateModuleApplyTool().execute({});
    expect(r.success).toBe(false);
    expect(r.error).toContain('module + label');
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('执行：调的是真生成（无 --dry-run），并把 CLI 输出如实带回', async () => {
    const r = await new CreateModuleApplyTool().execute({ module: 'posts', label: '文章' });
    expect(r.success).toBe(true);
    expect(execFileMock).toHaveBeenCalledTimes(1);

    const [file, argv] = execFileMock.mock.calls[0] as [string, string[]];
    expect(String(file)).toBe(process.execPath);
    expect(argv.slice(0, 3)).toEqual(['scripts/keelbase-init.mjs', '--module', 'posts']);
    expect(argv).not.toContain('--dry-run');
    expect(argv).not.toContain('--force');

    const data = r.data as { output: string; note: string };
    expect(data.output).toContain('generated posts');
    expect(data.note).toContain('不可撤销');
  });

  it('执行失败：把 CLI 的 stderr 如实带回', async () => {
    execFileMock.mockImplementationOnce(
      (_file: string, _args: string[], _options: unknown, callback: Function) =>
        callback(Object.assign(new Error('boom'), { stderr: 'refused: not in .keelbase/manifest.json' })),
    );
    const r = await new CreateModuleApplyTool().execute({ module: 'events', label: '事件' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('refused: not in .keelbase/manifest.json');
  });
});
