import { ReminderProcessor } from './reminder.processor';
import { NotificationsService } from '../notifications/notifications.service';
import { WxSubscribeService } from '../push/wx-subscribe.service';

describe('ReminderProcessor', () => {
  let processor: ReminderProcessor;
  const mockEventRepo = { findOne: jest.fn() };
  const mockNotifications = { create: jest.fn().mockResolvedValue({}) };
  const mockWxSubscribe = { sendReminder: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new ReminderProcessor(
      mockEventRepo as any,
      mockNotifications as unknown as NotificationsService,
      mockWxSubscribe as unknown as WxSubscribeService,
    );
  });

  it('creates notification when event due', async () => {
    mockEventRepo.findOne.mockResolvedValue({ id: 1, userId: 5, title: '会议', isCancelled: false });

    await processor.process({ data: { eventId: 1, userId: 5 } } as any);

    expect(mockNotifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 5,
        title: '事件提醒',
        body: '会议',
        type: 'reminder',
        targetType: 'event',
        targetId: '1',
        link: '/events/1',
      }),
    );
  });

  it('skips cancelled event', async () => {
    mockEventRepo.findOne.mockResolvedValue({ id: 1, userId: 5, isCancelled: true });

    await processor.process({ data: { eventId: 1, userId: 5 } } as any);

    expect(mockNotifications.create).not.toHaveBeenCalled();
  });

  it('skips event not owned by user', async () => {
    mockEventRepo.findOne.mockResolvedValue({ id: 1, userId: 99, isCancelled: false });

    await processor.process({ data: { eventId: 1, userId: 5 } } as any);

    expect(mockNotifications.create).not.toHaveBeenCalled();
  });

  it('skips missing event', async () => {
    mockEventRepo.findOne.mockResolvedValue(null);

    await processor.process({ data: { eventId: 1, userId: 5 } } as any);

    expect(mockNotifications.create).not.toHaveBeenCalled();
  });

  it('swallows repo errors', async () => {
    mockEventRepo.findOne.mockRejectedValue(new Error('db down'));

    await expect(
      processor.process({ data: { eventId: 1, userId: 5 } } as any),
    ).resolves.toBeUndefined();
  });
});
