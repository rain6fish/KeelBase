import { CapabilitiesService } from './capabilities.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';

describe('CapabilitiesService', () => {
  let service: CapabilitiesService;
  const flagsMock = { getFlags: jest.fn(), getPreset: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    flagsMock.getFlags.mockReturnValue({ suppliers: true, contracts: false, events: true });
    flagsMock.getPreset.mockReturnValue('full');
    service = new CapabilitiesService(flagsMock as any);
  });

  it('getCapabilities 返回 preset/features/businessModules', () => {
    const result = service.getCapabilities();

    expect(result.preset).toBe('full');
    expect(result.features).toEqual({ suppliers: true, contracts: false, events: true });
    expect(Array.isArray(result.businessModules)).toBe(true);
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
