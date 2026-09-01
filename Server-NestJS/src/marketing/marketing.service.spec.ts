// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../common/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { MarketingService } from './marketing.service';

describe('MarketingService（G-3）', () => {
  let service: MarketingService;
  let usersRepo: { find: jest.Mock };
  let mailService: { sendMarketingEmail: jest.Mock };

  beforeEach(async () => {
    usersRepo = { find: jest.fn() };
    mailService = { sendMarketingEmail: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketingService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = moduleRef.get(MarketingService);
  });

  it('audience=user 只发普通用户', async () => {
    usersRepo.find.mockResolvedValue([
      { id: 1, email: 'a@x.com', role: UserRole.USER },
      { id: 2, email: 'b@x.com', role: UserRole.USER },
    ]);

    const result = await service.send({ subject: '周报', body: '本周概览', audience: 'user' });

    expect(usersRepo.find).toHaveBeenCalledWith({ where: { role: UserRole.USER } });
    expect(mailService.sendMarketingEmail).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, total: 2 });
  });

  it('默认 all 发给全部用户', async () => {
    usersRepo.find.mockResolvedValue([{ id: 1, email: 'a@x.com' }]);
    const result = await service.send({ subject: '活动', body: '新功能上线' });
    expect(result.sent).toBe(1);
  });

  it('带 CTA 时透传', async () => {
    usersRepo.find.mockResolvedValue([{ id: 1, email: 'a@x.com' }]);
    await service.send({ subject: 's', body: 'b', ctaLabel: '去看看', ctaUrl: 'https://x.com' });
    expect(mailService.sendMarketingEmail).toHaveBeenCalledWith(
      'a@x.com',
      's',
      'b',
      { label: '去看看', url: 'https://x.com' },
    );
  });

  it('单用户失败不影响统计', async () => {
    usersRepo.find.mockResolvedValue([{ id: 1, email: 'a' }, { id: 2, email: 'b' }]);
    mailService.sendMarketingEmail
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);
    const result = await service.send({ subject: 's', body: 'b' });
    expect(result.sent).toBe(1);
  });
});
