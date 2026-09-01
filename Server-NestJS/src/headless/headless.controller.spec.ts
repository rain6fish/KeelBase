// SPDX-License-Identifier: Apache-2.0

import { HeadlessController } from './headless.controller';
import { AiService } from '../ai/ai.service';

describe('HeadlessController', () => {
  let controller: HeadlessController;
  let aiService: Record<string, jest.Mock>;

  beforeEach(() => {
    aiService = { chat: jest.fn() };
    controller = new HeadlessController(aiService as unknown as AiService);
  });

  it('无头对话以 key 归属用户身份委托 aiService', async () => {
    aiService.chat.mockResolvedValue({ reply: '你好', conversationId: 'c1' });
    const req = { headlessKey: { ownerUserId: 7 } };
    const result = await controller.chat(
      { message: '你好', provider: 'deepseek', model: 'deepseek-chat' } as any,
      req as any,
    );
    expect(result).toEqual({ reply: '你好', conversationId: 'c1' });
    expect(aiService.chat).toHaveBeenCalledWith('7', {
      message: '你好',
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
  });

  it('未传 provider/model 时只传 message', async () => {
    aiService.chat.mockResolvedValue({ reply: 'ok', conversationId: 'c2' });
    const req = { headlessKey: { ownerUserId: 9 } };
    await controller.chat({ message: 'hi' } as any, req as any);
    expect(aiService.chat).toHaveBeenCalledWith('9', { message: 'hi', provider: undefined, model: undefined });
  });
});
