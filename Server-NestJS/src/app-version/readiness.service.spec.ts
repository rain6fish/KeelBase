// SPDX-License-Identifier: Apache-2.0

import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ReadinessService } from './readiness.service';

describe('ReadinessService（NC-3 首次运行就绪清单）', () => {
  const env: Record<string, string> = {};

  const build = (opts: {
    query?: jest.Mock;
    policy?: unknown;
    demoSeeded?: string;
    settingsReject?: boolean;
  } = {}) => {
    const dataSource = {
      options: { type: 'better-sqlite3' },
      query: opts.query ?? jest.fn().mockResolvedValue([{ 1: 1 }]),
    } as unknown as DataSource;
    const config = { get: (k: string, d?: unknown) => env[k] ?? d } as unknown as ConfigService;
    const governancePolicy = {
      getPolicy: jest.fn().mockResolvedValue(
        opts.policy ?? { tools: {}, audit: { granularity: 'all' }, updatedAt: null, revision: 'a'.repeat(64) },
      ),
    };
    const settings = {
      getWithDefault: opts.settingsReject
        ? jest.fn().mockRejectedValue(new Error('redis down'))
        : jest.fn().mockResolvedValue(opts.demoSeeded ?? ''),
    };
    return new ReadinessService(
      dataSource,
      config,
      governancePolicy as never,
      settings as never,
    );
  };

  beforeEach(() => {
    delete env.AI_PROVIDER;
    delete env.DEEPSEEK_API_KEY;
    delete env.OLLAMA_BASE_URL;
  });

  it('五维齐备（DB 通 / 模型已配 / 策略可读 / 演示已种）→ ready=true，且 demo 已种无下一步', async () => {
    env.DEEPSEEK_API_KEY = 'sk-x';
    const r = await build({ demoSeeded: '2026-09-11' }).check();
    expect(r.ready).toBe(true);
    expect(Object.keys(r.dimensions).sort()).toEqual(['ai', 'db', 'demo', 'governance', 'runtime']);
    expect(r.dimensions.runtime.ready).toBe(true);
    expect(r.dimensions.runtime.detail).toContain('v');
    expect(r.dimensions.ai.detail).toContain('deepseek');
    expect(r.dimensions.demo.ready).toBe(true);
    expect(r.dimensions.demo.nextStep).toBeNull();
  });

  it('DB 探测失败 → db 不 ready + 给出下一步；整体 ready=false，且不泄露原始错误', async () => {
    env.DEEPSEEK_API_KEY = 'sk-x';
    const r = await build({ query: jest.fn().mockRejectedValue(new Error('boom ECONNREFUSED')) }).check();
    expect(r.dimensions.db.ready).toBe(false);
    expect(r.dimensions.db.detail).toBe('数据库不可用');
    // 公开端点不得回显驱动原始错误（主机/端口等）
    expect(r.dimensions.db.detail).not.toContain('boom');
    expect(r.dimensions.db.nextStep).toBeTruthy();
    expect(r.ready).toBe(false);
  });

  it('未配真实模型 → ai 不 ready，detail 如实说明 demo 可用、下一步给配置路径', async () => {
    const r = await build().check();
    expect(r.dimensions.ai.ready).toBe(false);
    expect(r.dimensions.ai.detail).toContain('demo provider');
    expect(r.dimensions.ai.nextStep).toContain('DEEPSEEK_API_KEY');
  });

  it('AI_PROVIDER=ollama → ai ready（数据不出域路径）', async () => {
    env.AI_PROVIDER = 'ollama';
    env.OLLAMA_BASE_URL = 'http://localhost:11434';
    const r = await build().check();
    expect(r.dimensions.ai.ready).toBe(true);
    expect(r.dimensions.ai.detail).toContain('Ollama');
  });

  it('仅设 OLLAMA_BASE_URL 但 AI_PROVIDER 仍默认 deepseek → ai 不 ready（Ollama 非生效路径，不误报就绪）', async () => {
    env.OLLAMA_BASE_URL = 'http://localhost:11434';
    const r = await build().check();
    expect(r.dimensions.ai.ready).toBe(false);
  });

  it('演示数据设置读取失败 → demo 降级为「未知」而非抛出（公开端点不 500）', async () => {
    env.DEEPSEEK_API_KEY = 'sk-x';
    const r = await build({ settingsReject: true }).check();
    expect(r.dimensions.demo.ready).toBe(false);
    expect(r.dimensions.demo.detail).toContain('未知');
    expect(r.ready).toBe(true); // demo 可选，不影响核心
  });

  it('治理策略：有策略行（updatedAt 非空）→ 标「已自定义」并带内容指纹版本', async () => {
    const r = await build({
      policy: { tools: {}, audit: { granularity: 'all' }, updatedAt: new Date(), revision: 'b'.repeat(64) },
    }).check();
    expect(r.dimensions.governance.ready).toBe(true);
    expect(r.dimensions.governance.detail).toContain('已自定义');
    expect(r.dimensions.governance.detail).toContain('b'.repeat(12));
  });

  it('演示数据未种 → demo 不 ready 且给 seed 命令；但**不计入**整体 ready（可选维度）', async () => {
    env.DEEPSEEK_API_KEY = 'sk-x';
    const r = await build({ demoSeeded: '' }).check();
    expect(r.dimensions.demo.ready).toBe(false);
    expect(r.dimensions.demo.nextStep).toBe('npm run seed:demo');
    expect(r.ready).toBe(true); // demo 为可选，不影响核心就绪判定
  });
});
