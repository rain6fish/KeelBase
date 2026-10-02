// SPDX-License-Identifier: Apache-2.0

/**
 * The completeness gate for the tool metadata table.
 *
 * A hand-maintained table drifts the moment someone adds a tool and forgets it, or renames a tool and
 * leaves the old entry behind. Both happened: four labels named tools that do not exist, and twelve
 * real tools had none. So the check runs against the **live registry** — the set of tools the AI can
 * actually call — rather than against another hand-written list.
 *
 * 工具元数据表的完备性闸。
 *
 * 手维护的表，在「新增工具忘了登记」或「工具改名、旧条目留在原地」的那一刻就漂移。两者都发生过：
 * 四条标签指向**不存在**的工具，而 12 个真工具一条标签都没有。所以这道闸对着**活注册表**查 ——
 * 也就是 AI 实际能调用的那批工具 —— 而不是再拿一份手写清单来对。
 *
 * 边界（如实）：`external: true` 的条目不参与断言 —— 那些名字由目标系统定义（B 路径代理），
 * 本仓不注册它们，拿注册表去判会把真实的外部工具误报成死条目。
 */
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers';
import { ToolRegistry } from '../src/ai/tools/tool-registry';
import { TOOL_METADATA } from '../src/ai/audit/tool-metadata';

describe('AI 工具元数据（标签 / 业务事件的单一真源）', () => {
  let app: INestApplication;
  let registered: string[];

  beforeAll(async () => {
    app = await createTestApp();
    registered = app
      .get(ToolRegistry)
      .getAllTools()
      .map((t) => t.name);
  });

  afterAll(async () => {
    await app.close();
  });

  it('注册表非空（否则下面两条断言是真空的）', () => {
    expect(registered.length).toBeGreaterThan(20);
  });

  it('每个已注册工具都有元数据（新增工具忘了登记 ⇒ 红）', () => {
    const missing = registered.filter((name) => !TOOL_METADATA[name]);
    expect(missing).toEqual([]);
  });

  it('未标 external 的元数据条目都必须是已注册工具（改名后留下的死条目 ⇒ 红）', () => {
    const dead = Object.entries(TOOL_METADATA)
      .filter(([, meta]) => !meta.external)
      .map(([name]) => name)
      .filter((name) => !registered.includes(name));
    expect(dead).toEqual([]);
  });

  it('每个已注册工具的元数据都带非空英文标签', () => {
    const blank = registered.filter((name) => !TOOL_METADATA[name]?.label);
    expect(blank).toEqual([]);
  });
});
