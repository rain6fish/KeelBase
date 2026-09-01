// SPDX-License-Identifier: Apache-2.0

/**
 * System AI L4 Act（roadmap §5）：管理端 AI 预览创建业务模块。
 *
 * 委托 `keelbase init` 约定式流程（**非内建生成器**）——执行 `--dry-run`
 * 预览将生成的模块定义/接线清单/文件，**不写任何文件**（R1 读，无副作用）。
 * 用户确认预览后手动跑真实 CLI 生成（引导），符合「AI 按约定生成，开发者拥有代码」。
 *
 * 管理端专属（adminOnly）：创建模块影响仓库结构，仅管理员可触发预览。
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

/** 仓库根：当前 cwd 或上层含 scripts/keelbase-init.mjs 的目录（dev/Server-NestJS 场景） */
function repoRoot(): string {
  const candidates = [process.cwd(), resolve(process.cwd(), '..'), resolve(process.cwd(), '../..')];
  for (const dir of candidates) {
    try {
      accessSync(resolve(dir, 'scripts/keelbase-init.mjs'));
      return dir;
    } catch {
      /* 继续尝试 */
    }
  }
  return process.cwd();
}

export class CreateModuleTool implements AiTool {
  readonly name = 'create_module';
  readonly description =
    '预览创建业务模块（keelbase init dry-run，不写文件）：输入模块名/标签/字段或自然语言描述，返回将生成的模块定义、AI 工具、接线清单。确认后手动执行 node scripts/keelbase-init.mjs <参数> 真实生成。';
  readonly permissions = { adminOnly: true, featureFlag: 'ai' };
  readonly riskLevel = 'R1'; // dry-run 无副作用
  readonly parameters: ToolParameter[] = [
    { name: 'desc', type: 'string', description: '自然语言描述（如 图书管理，有书名作者价格）——LLM 提取模块/标签/字段', required: false },
    { name: 'module', type: 'string', description: '模块英文名（小写，如 posts）', required: false },
    { name: 'label', type: 'string', description: '模块中文标签（1-12 字）', required: false },
    { name: 'fields', type: 'string', description: '字段列表（a:string,b:int,status:enum:active,inactive）', required: false },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const cliArgs: string[] = [];
    if (args.desc) {
      cliArgs.push('--desc', String(args.desc));
    } else {
      if (!args.module || !args.label) {
        return { success: false, error: '需要 --desc 自然语言描述，或 module + label（+ 可选 fields）' };
      }
      cliArgs.push('--module', String(args.module));
      cliArgs.push('--label', String(args.label));
      if (args.fields) cliArgs.push('--fields', String(args.fields));
    }
    cliArgs.push('--dry-run');

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ['scripts/keelbase-init.mjs', ...cliArgs],
        { cwd: repoRoot(), timeout: 30_000, encoding: 'utf8' },
      );
      return {
        success: true,
        data: {
          output: stdout.trim(),
          note: 'dry-run 预览（未写任何文件）——确认无误后手动执行生成：node scripts/keelbase-init.mjs ' + cliArgs.join(' '),
        },
      };
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return { success: false, error: `keelbase init 预览失败: ${e.stderr || e.message}` };
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
