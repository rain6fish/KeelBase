// SPDX-License-Identifier: Apache-2.0

import { ReflectionAgent } from './reflection-agent.service';

const mockProvider = {
  availableModels: ['deepseek-v4-flash'],
  generate: jest.fn(),
};

describe('ReflectionAgent', () => {
  const agent = new ReflectionAgent();
  const messages = [{ role: 'user' as const, content: '写一段介绍' }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider.generate.mockResolvedValue({ content: '' });
  });

  it('回复过短时不调用 LLM，直接返回原文', async () => {
    const short = '好的';
    expect(await agent.reflect(messages, short, mockProvider as any)).toBe(short);
    expect(mockProvider.generate).not.toHaveBeenCalled();
  });

  const longReply = '这是一段超过五十个字符的回复，用于触发反思流程，需要足够的文字内容才能满足长度判断条件，确保代码会调用 LLM 进行自我审核。';

  it('LLM 返回 OK 时保留原文', async () => {
    mockProvider.generate.mockResolvedValue({ content: 'OK' });
    expect(await agent.reflect(messages, longReply, mockProvider as any)).toBe(longReply);
  });

  it('LLM 返回改进版时采用改进版', async () => {
    mockProvider.generate.mockResolvedValue({ content: '  这是改进后的完整版本，更加简洁专业。  ' });
    const result = await agent.reflect(messages, longReply, mockProvider as any);
    expect(result).toBe('这是改进后的完整版本，更加简洁专业。');
    expect(mockProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          { role: 'assistant', content: longReply },
          expect.objectContaining({ role: 'user' }),
        ]),
      }),
    );
  });

  it('LLM 返回空内容时保留原文', async () => {
    mockProvider.generate.mockResolvedValue({ content: '   ' });
    expect(await agent.reflect(messages, longReply, mockProvider as any)).toBe(longReply);
  });

  it('LLM 异常时回退原文', async () => {
    mockProvider.generate.mockRejectedValue(new Error('llm down'));
    expect(await agent.reflect(messages, longReply, mockProvider as any)).toBe(longReply);
  });
});
