// SPDX-License-Identifier: Apache-2.0

import { GenerateImageTool } from './generate-image.tool';

function makeFactory(overrides: Record<string, unknown> = {}) {
  return {
    getProvider: jest.fn().mockReturnValue({
      generateImage: jest.fn().mockResolvedValue('https://img.example.com/a.png'),
      ...overrides,
    }),
  } as any;
}

describe('GenerateImageTool（AI-12.1）', () => {
  it('成功生成返回图片 URL', async () => {
    const factory = makeFactory();
    const tool = new GenerateImageTool(factory, 'deepseek');

    const result = await tool.execute({ prompt: '一只猫' });

    expect(result.success).toBe(true);
    expect((result.data as any).url).toBe('https://img.example.com/a.png');
    expect(factory.getProvider).toHaveBeenCalledWith('deepseek');
  });

  it('空 prompt 报错', async () => {
    const tool = new GenerateImageTool(makeFactory(), 'deepseek');
    const result = await tool.execute({ prompt: '  ' });
    expect(result.success).toBe(false);
  });

  it('provider 不支持 images 时返回降级', async () => {
    const factory = { getProvider: jest.fn().mockReturnValue({}) } as any;
    const tool = new GenerateImageTool(factory, 'deepseek');
    const result = await tool.execute({ prompt: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('不支持');
  });

  it('生成失败时返回错误', async () => {
    const factory = makeFactory({ generateImage: jest.fn().mockRejectedValue(new Error('API down')) });
    const tool = new GenerateImageTool(factory, 'deepseek');
    const result = await tool.execute({ prompt: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('API down');
  });

  it('toToolDefinition 含 prompt 必填', () => {
    const tool = new GenerateImageTool(makeFactory(), 'deepseek');
    expect(tool.toToolDefinition().function.parameters.required).toContain('prompt');
  });
});
