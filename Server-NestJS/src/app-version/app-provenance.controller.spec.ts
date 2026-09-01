// SPDX-License-Identifier: Apache-2.0

import { AppProvenanceController } from './app-provenance.controller';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AiService } from '../ai/ai.service';

jest.mock('fs', () => ({
  // spread 真实 fs：控制器导入链（→ ai.service → rag → document-parser → mammoth）在模块加载期
  // 需要 fs.readFile 等真实 API，只覆盖被测的 existsSync/readFileSync
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

import * as fs from 'fs';

describe('AppProvenanceController', () => {
  let controller: AppProvenanceController;
  const flagsMock = { getFlags: jest.fn(), getPreset: jest.fn() };
  const aiMock = { getToolFingerprint: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    flagsMock.getFlags.mockReturnValue({ suppliers: true, contracts: true });
    flagsMock.getPreset.mockReturnValue('full');
    aiMock.getToolFingerprint.mockReturnValue({ read: 3, write: 2 });
    controller = new AppProvenanceController(flagsMock as any, aiMock as any);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ name: 'keelbase', version: '0.9.2' }),
    );
  });

  it('getProvenance 返回 source + runtime（来源身份 + 能力 + 工具指纹）', () => {
    const result = controller.getProvenance();

    expect(result.source).toEqual({ manifestPresent: true, name: 'keelbase', version: '0.9.2' });
    expect(result.runtime.preset).toBe('full');
    expect(Array.isArray(result.runtime.businessModules)).toBe(true);
    expect(result.runtime.aiToolFingerprint).toEqual({ read: 3, write: 2 });
  });

  it('businessModules 过滤被禁用的模块（feature flag 关闭）', () => {
    flagsMock.getFlags.mockReturnValue({ suppliers: false, contracts: true });

    const result = controller.getProvenance();
    const ids = result.runtime.businessModules.map((m: { id: string }) => m.id);

    expect(ids).not.toContain('suppliers');
    expect(ids).toContain('contracts');
  });

  it('manifest 缺失 → manifestPresent:false', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const result = controller.getProvenance();

    expect(result.source).toEqual({ manifestPresent: false });
  });

  it('manifest JSON 解析失败 → manifestPresent:true 且不含内容', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('not-valid-json');

    const result = controller.getProvenance();

    expect(result.source).toEqual({ manifestPresent: true });
  });
});
