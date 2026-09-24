// SPDX-License-Identifier: Apache-2.0

import { CapabilitiesService } from './capabilities.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { CURRENCY_SYMBOL } from '../common/utils/money';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CapabilitiesService', () => {
  let service: CapabilitiesService;
  const flagsMock = { getFlags: jest.fn(), getPreset: jest.fn() };
  const configMock = { get: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    flagsMock.getFlags.mockReturnValue({ suppliers: true, contracts: false, events: true, ai: true });
    flagsMock.getPreset.mockReturnValue('full');
    configMock.get.mockImplementation((k: string, d?: unknown) => (k === 'AI_PROVIDER' ? 'deepseek' : d));
    service = new CapabilitiesService(flagsMock as any, configMock as any);
  });

  it('getCapabilities 返回 preset/features/businessModules', () => {
    const result = service.getCapabilities();

    expect(result.preset).toBe('full');
    expect(result.features).toEqual({ suppliers: true, contracts: false, events: true, ai: true });
    expect(Array.isArray(result.businessModules)).toBe(true);
  });

  it('② 绑定：getCapabilities 顶层键集 == capabilities 冻结契约（版本取自 registry）', () => {
    // 版本按 **registry 声明**解析，不硬写 `v1` —— 契约升版时本断言自动跟随。
    // 硬写路径的代价是实测过的：加 `display`（v2）时它会失败，而失败信息指向的是一个
    // 已经过时的路径，看不出「契约升版了、绑定该跟上去」。
    const registry = JSON.parse(
      readFileSync(resolve(__dirname, '../../specs/protocol/wire-schema-registry.json'), 'utf8'),
    ) as { objects: Array<{ id: string; version: string; schema: string }> };
    const entry = registry.objects.find((o) => o.id === 'capabilities');
    expect(entry).toBeDefined();
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, `../../specs/protocol/schemas/${entry!.version}/${entry!.schema}`), 'utf8'),
    ) as { properties: Record<string, unknown> };
    expect(Object.keys(service.getCapabilities()).sort()).toEqual(Object.keys(schema.properties).sort());
  });

  it('display：币种符号由服务端发布，且与后端格式化用的是同一个常量', () => {
    const result = service.getCapabilities();
    expect(result.display.currencySymbol).toBe(CURRENCY_SYMBOL);
    expect(result.display.currencySymbol.length).toBeGreaterThan(0);
  });

  it('ai.providerConfigured：provider 无 Key → false', () => {
    const result = service.getCapabilities();
    expect(result.ai.enabled).toBe(true);
    expect(result.ai.providerConfigured).toBe(false);
    expect(result.ai.provider).toBe('deepseek');
  });

  it('ai.providerConfigured：provider 配了 Key → true', () => {
    configMock.get.mockImplementation((k: string) => {
      if (k === 'AI_PROVIDER') return 'deepseek';
      if (k === 'DEEPSEEK_API_KEY') return 'sk-test';
      return undefined;
    });
    expect(service.getCapabilities().ai.providerConfigured).toBe(true);
  });

  it('ai.providerConfigured：ollama 显式选择 → true；AI feature 关 → enabled=false', () => {
    configMock.get.mockImplementation((k: string) => (k === 'AI_PROVIDER' ? 'ollama' : undefined));
    expect(service.getCapabilities().ai.providerConfigured).toBe(true);
    flagsMock.getFlags.mockReturnValue({ ai: false });
    expect(service.getCapabilities().ai.enabled).toBe(false);
  });

  it('businessModules 只含启用的业务模块（feature flag !== false）', () => {
    const result = service.getCapabilities();
    const ids = result.businessModules.map((m) => m.id);

    // suppliers/events 启用（不在 manifest 的也自然排除），contracts 被禁用
    expect(ids).toContain('suppliers');
    expect(ids).not.toContain('contracts');
  });

  it('全禁用时 businessModules 仅含未被显式关闭的模块（默认启用）', () => {
    flagsMock.getFlags.mockReturnValue({});
    const result = service.getCapabilities();
    const ids = result.businessModules.map((m) => m.id);

    // 未显式配置的模块默认启用（flags[id] !== false）
    expect(ids.length).toBeGreaterThan(0);
  });
});
