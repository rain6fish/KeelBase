import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PushTokenService } from './push-token.service';
import { PushToken } from './push-token.entity';

describe('PushTokenService', () => {
  let service: PushTokenService;
  const mockRepo = {
    findOne: jest.fn(),
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushTokenService,
        { provide: getRepositoryToken(PushToken), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<PushTokenService>(PushTokenService);
  });

  describe('registerToken', () => {
    it('creates a new token row', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.registerToken(1, {
        platform: 'android',
        token: 'reg-abc',
        deviceId: 'dev-1',
      });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, token: 'reg-abc', platform: 'android' }),
      );
      expect(result.userId).toBe(1);
    });

    it('updates existing (userId+token) row', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 5,
        userId: 1,
        platform: 'ios',
        token: 'reg-abc',
      });

      await service.registerToken(1, { platform: 'ios', token: 'reg-abc', deviceId: 'dev-2' });

      const saved = mockRepo.save.mock.calls[0][0];
      expect(saved.id).toBe(5);
      expect(saved.deviceId).toBe('dev-2');
    });
  });

  describe('unregisterToken', () => {
    it('deletes by userId+token', async () => {
      await service.unregisterToken(1, 'reg-abc');

      expect(mockRepo.delete).toHaveBeenCalledWith({ userId: 1, token: 'reg-abc' });
    });
  });

  describe('getTokensForUser', () => {
    it('returns tokens for the user', async () => {
      mockRepo.find.mockResolvedValue([{ token: 'a' }, { token: 'b' }]);

      const result = await service.getTokensForUser(1);

      expect(mockRepo.find).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(result).toHaveLength(2);
    });
  });
});
