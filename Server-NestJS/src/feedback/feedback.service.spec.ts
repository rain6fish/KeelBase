import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../common/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { FeedbackService } from './feedback.service';

describe('FeedbackService（G-1）', () => {
  let service: FeedbackService;
  let usersRepo: { find: jest.Mock };
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    usersRepo = { find: jest.fn() };
    notificationsService = { create: jest.fn().mockResolvedValue({ id: 1 }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();
    service = moduleRef.get(FeedbackService);
  });

  it('提交后通知全体管理员 type=feedback', async () => {
    usersRepo.find.mockResolvedValue([
      { id: 1, role: UserRole.ADMIN },
      { id: 2, role: UserRole.ADMIN },
    ]);

    const result = await service.submit('42', {
      type: 'bug',
      content: '登录页按钮错位',
      contact: 'user@example.com',
    });

    expect(result).toEqual({ received: true, notifiedAdmins: 2 });
    expect(notificationsService.create).toHaveBeenCalledTimes(2);
    const first = notificationsService.create.mock.calls[0][0];
    expect(first.userId).toBe(1);
    expect(first.type).toBe('feedback');
    expect(first.title).toContain('问题');
    expect(first.body).toContain('登录页按钮错位');
    expect(first.body).toContain('user@example.com');
  });

  it('无管理员时返回 notifiedAdmins=0 不抛错', async () => {
    usersRepo.find.mockResolvedValue([]);

    const result = await service.submit('1', { type: 'praise', content: '很好用' });

    expect(result.notifiedAdmins).toBe(0);
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('单管理员通知失败不影响统计', async () => {
    usersRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    notificationsService.create
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 2 });

    const result = await service.submit('1', { type: 'suggestion', content: 'x' });
    expect(result.notifiedAdmins).toBe(1);
  });
});
