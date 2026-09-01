// SPDX-License-Identifier: Apache-2.0

import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';

describe('MarketingController', () => {
  let controller: MarketingController;
  let marketingService: Record<string, jest.Mock>;

  beforeEach(() => {
    marketingService = { send: jest.fn() };
    controller = new MarketingController(marketingService as unknown as MarketingService);
  });

  it('发送运营邮件委托 service', () => {
    const dto = { subject: '周报', body: '本周数据...', audience: 'user' };
    marketingService.send.mockResolvedValue({ sent: 12 });

    expect(controller.send(dto as any)).resolves.toEqual({ sent: 12 });
    expect(marketingService.send).toHaveBeenCalledWith(dto);
  });
});
