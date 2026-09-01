// SPDX-License-Identifier: Apache-2.0

import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

describe('FeedbackController', () => {
  let controller: FeedbackController;
  let feedbackService: Record<string, jest.Mock>;

  beforeEach(() => {
    feedbackService = { submit: jest.fn() };
    controller = new FeedbackController(feedbackService as unknown as FeedbackService);
  });

  it('提交反馈委托 service（userId 转字符串）', () => {
    const dto = { type: 'bug', content: '页面白屏', contact: 'test@example.com' };
    feedbackService.submit.mockResolvedValue({ id: 1 });

    expect(controller.submit({ sub: 42, username: 'alex' } as any, dto as any)).resolves.toEqual({ id: 1 });
    expect(feedbackService.submit).toHaveBeenCalledWith('42', dto);
  });
});
