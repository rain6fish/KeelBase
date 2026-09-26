// SPDX-License-Identifier: Apache-2.0

/**
 * System AI L4 Act — the write half of creating a module.
 *
 * The read half is `create_module`, which previews and writes nothing. This one runs `keelbase init`
 * for real, so the files land in the repository.
 *
 * Whether to write is **not this tool's decision** — that belongs to the governance layer, and the tool
 * asks for it by declaring a confirmation (`requiresConfirmation`, which derives R3): the runtime holds
 * the call until a human approves, and only then does `execute` run. The rule this follows is the
 * project's own: the model proposes, the runtime imposes.
 *
 * What it guarantees, and what it does not:
 *   - administrator-only — creating a module changes the repository's shape;
 *   - `--force` is never passed, so `keelbase init`'s own guard still refuses a module that is not in
 *     `.keelbase/manifest.json`. This tool therefore cannot overwrite a handwritten module;
 *   - the write is **not revocable through the runtime** (`revokeClass: none`): deleting files is not
 *     something the side-effect machinery can do. The confirmation card says that rather than promising
 *     a rollback.
 *
 * 写的那一半。读的那一半是 `create_module`（只预览、不写文件）；这一半**真跑** `keelbase init`，文件落到
 * 仓库里。
 *
 * **要不要写不由本工具决定** —— 那是治理层的事，本工具通过声明**确认**（`requiresConfirmation`，派生 R3）
 * 来请求它：运行时会扣住这次调用，直到有人点头，`execute` 才被执行。这条遵循本仓自己的规矩：**模型提议，
 * 运行时施加**。
 *
 * 保证什么、不保证什么：
 *   - **仅管理员** —— 创建一个模块会改变仓库的形状；
 *   - **不传 `--force`**，故 `keelbase init` 自己的守卫依然生效（不在 `.keelbase/manifest.json` 里的模块
 *     一律拒绝）⇒ 本工具**覆盖不了手写模块**；
 *   - 这份写**不可由运行时撤销**（`revokeClass: none`）：删文件不是副作用机制能做的事。确认卡上如实说明，
 *     而不是承诺回滚。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { accessSync } from 'node:fs';
import {
  AiTool,
  ToolDefinition,
  ToolResult,
  ToolParameter,
} from '../interfaces/tool.interface';

const execFileAsync = promisify(execFile);

/** The repository root: cwd, or an ancestor that holds `scripts/keelbase-init.mjs` (the dev layout). */
function repoRoot(): string {
  const candidates = [process.cwd(), resolve(process.cwd(), '..'), resolve(process.cwd(), '../..')];
  for (const dir of candidates) {
    try {
      accessSync(resolve(dir, 'scripts/keelbase-init.mjs'));
      return dir;
    } catch {
      /* try the next one */
    }
  }
  return process.cwd();
}

/**
 * The CLI arguments for a real generation.
 *
 * Exported because it is the whole of this tool's judgement, and it carries two invariants worth
 * asserting without running anything: **no `--dry-run`** (this is the half that writes) and **no
 * `--force`** (the CLI's guard against overwriting a handwritten module stays armed).
 *
 * 真实生成要用的 CLI 参数。之所以导出：它是本工具**全部**的判断，而且它带两条不必运行就能断言的不变量——
 * **不带 `--dry-run`**（这一半就是写的），**不带 `--force`**（CLI 那道「不覆盖手写模块」的守卫因此保持有效）。
 */
export function cliArgsFor(args: Record<string, unknown>): { args: string[] } | { error: string } {
  const cliArgs: string[] = [];
  if (args.desc) {
    cliArgs.push('--desc', String(args.desc));
  } else {
    if (!args.module || !args.label) {
      return { error: '需要 --desc 自然语言描述，或 module + label（+ 可选 fields）' };
    }
    cliArgs.push('--module', String(args.module));
    cliArgs.push('--label', String(args.label));
    if (args.fields) cliArgs.push('--fields', String(args.fields));
  }
  return { args: cliArgs };
}

export class CreateModuleApplyTool implements AiTool {
  readonly name = 'create_module_apply';
  readonly requiresConfirmation = true; // 写工具 ⇒ 风险级派生 R3
  readonly revokeClass = 'none'; // 文件写入不可由运行时撤销 —— 如实声明，不谎称 local_compensate
  readonly permissions = { adminOnly: true, featureFlag: 'ai' };
  readonly description =
    '真实生成业务模块（写仓库文件，不可撤销）。用法：先用 create_module 预览，把预览结果给用户看；' +
    '用户明确同意后再调用本工具，参数与预览时一致。本工具会写文件（管理员专属），调用时系统会弹出确认框。';
  readonly parameters: ToolParameter[] = [
    { name: 'desc', type: 'string', description: '自然语言描述（如 图书管理，有书名作者价格）——LLM 提取模块/标签/字段', required: false },
    { name: 'module', type: 'string', description: '模块英文名（小写，如 posts）', required: false },
    { name: 'label', type: 'string', description: '模块中文标签（1-12 字）', required: false },
    { name: 'fields', type: 'string', description: '字段列表（a:string,b:int,status:enum:active,inactive）', required: false },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const built = cliArgsFor(args);
    if ('error' in built) {
      return { success: false, error: built.error };
    }

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ['scripts/keelbase-init.mjs', ...built.args],
        { cwd: repoRoot(), timeout: 60_000, encoding: 'utf8' },
      );
      return {
        success: true,
        data: {
          output: stdout.trim(),
          note: '已写入仓库。**不可撤销**：删除请手动回退文件；重复生成同一模块请先确认它已在 .keelbase/manifest.json 中。',
        },
      };
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return { success: false, error: `keelbase init 生成失败: ${e.stderr || e.message}` };
    }
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            this.parameters.map((p) => [p.name, { type: p.type, description: p.description }]),
          ),
        },
      },
    };
  }
}
