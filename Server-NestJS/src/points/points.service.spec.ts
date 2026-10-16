// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { PointsService } from './points.service';
import { PointsEntry } from './points-entry.entity';
import { User } from '../common/entities/user.entity';
import { SettingsService } from '../settings/settings.service';
import { UploadSignService } from '../upload/upload-sign.service';
import { EncryptionService } from '../common/utils/encryption';

function mockRepo() {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
  };
  return {
    create: jest.fn((x) => x ?? {}),
    save: jest.fn((x) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => qb),
  };
}

describe('PointsService (GROWTH-3)', () => {
  let service: PointsService;
  let entries: ReturnType<typeof mockRepo>;
  let users: ReturnType<typeof mockRepo>;
  let settings: { getWithDefault: jest.Mock };
  let uploadSign: UploadSignService;

  const checkinEntry = (createdAt: Date) => ({
    id: 1,
    userId: 1,
    points: 10,
    reason: 'checkin',
    createdAt,
    checkinDate: createdAt.toISOString().slice(0, 10),
  });

  beforeEach(async () => {
    entries = mockRepo();
    users = mockRepo();
    settings = { getWithDefault: jest.fn().mockResolvedValue(10) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointsService,
        { provide: getRepositoryToken(PointsEntry), useValue: entries },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: SettingsService, useValue: settings },
        { provide: EncryptionService, useValue: { hmac: jest.fn((v: string) => `hmac:${v}`) } },
        UploadSignService,
      ],
    }).compile();

    service = module.get(PointsService);
    uploadSign = module.get(UploadSignService);
  });

  it('首次签到：streak=1，积分=基础分', async () => {
    entries.find.mockResolvedValue([]); // 无历史签到
    entries.createQueryBuilder().getRawOne.mockResolvedValue({ sum: 10 }); // balance after save
    const result = await service.checkIn(1);
    expect(result.streak).toBe(1);
    expect(result.points).toBe(10);
    expect(entries.save).toHaveBeenCalledWith(
      expect.objectContaining({ points: 10, reason: 'checkin' }),
    );
  });

  it('同一天重复签到：409', async () => {
    entries.find.mockResolvedValue([checkinEntry(new Date())]);
    await expect(service.checkIn(1)).rejects.toThrow(ConflictException);
  });

  it('并发重复签到被唯一约束兜底：409（A1）', async () => {
    entries.find.mockResolvedValue([]); // 检查-插入间隙内另一请求已插入
    entries.save.mockRejectedValue({
      code: 'SQLITE_CONSTRAINT',
      message: 'UNIQUE constraint failed: points_entries.user_id, points_entries.checkin_date',
    });
    await expect(service.checkIn(1)).rejects.toThrow(ConflictException);
    expect(entries.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'checkin', checkinDate: expect.any(String) }),
    );
  });

  it('积分值 NaN 回退默认值（A13）', async () => {
    entries.find.mockResolvedValue([]);
    settings.getWithDefault.mockResolvedValue(NaN);
    entries.createQueryBuilder().getRawOne.mockResolvedValue({ sum: 10 });
    const result = await service.checkIn(1);
    expect(result.points).toBe(10);
  });

  it('积分值负值回退默认值（A13）', async () => {
    entries.find.mockResolvedValue([]);
    settings.getWithDefault.mockResolvedValue(-5);
    entries.createQueryBuilder().getRawOne.mockResolvedValue({ sum: 10 });
    const result = await service.checkIn(1);
    expect(result.points).toBe(10);
  });

  it('昨日已签：今日签到 streak 延续 + 连签加成', async () => {
    const yesterday = new Date(Date.now() - 86400000);
    entries.find.mockResolvedValue([checkinEntry(yesterday)]);
    settings.getWithDefault.mockImplementation((key: string) =>
      Promise.resolve(key === 'points_checkin_base' ? 10 : 2),
    );
    entries.createQueryBuilder().getRawOne.mockResolvedValue({ sum: 22 });
    const result = await service.checkIn(1);
    expect(result.streak).toBe(2);
    expect(result.points).toBe(12); // 10 + (2-1)*2
  });

  it('我的概览：余额/今日是否已签/连签', async () => {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    const dayBefore = new Date(Date.now() - 2 * 86400000);
    entries.find.mockResolvedValue([checkinEntry(today), checkinEntry(yesterday), checkinEntry(dayBefore)]);
    entries.createQueryBuilder().getRawOne.mockResolvedValue({ sum: 30 });
    const overview = await service.getMyOverview(1);
    expect(overview.balance).toBe(30);
    expect(overview.todayCheckedIn).toBe(true);
    expect(overview.streak).toBe(3);
  });

  it('连签超过 40 天不被时间窗截断', async () => {
    const base = Date.now();
    const days = Array.from({ length: 41 }, (_, i) => checkinEntry(new Date(base - i * 86400000)));
    entries.find.mockResolvedValue(days);
    entries.createQueryBuilder().getRawOne.mockResolvedValue({ sum: 10 });
    const overview = await service.getMyOverview(1);
    expect(overview.streak).toBe(41);
  });

  it('排行榜：聚合 + 脱敏（无 userId/email/phone）', async () => {
    entries.createQueryBuilder().getRawMany.mockResolvedValue([
      { userId: 1, points: 50 },
      { userId: 2, points: 20 },
    ]);
    users.find.mockResolvedValue([
      { id: 1, nickname: 'Alice', avatarUrl: 'a.png' },
      { id: 2, nickname: 'Bob', avatarUrl: null },
    ]);
    const lb = await service.getLeaderboard(20);
    expect(lb).toHaveLength(2);
    expect(lb[0]).toEqual({ points: 50, nickname: 'Alice', avatarUrl: 'a.png' });
    // A9：不暴露内部 userId（避免枚举）
    expect(Object.keys(lb[0])).not.toContain('userId');
    expect(Object.keys(lb[0])).not.toContain('email');
    expect(Object.keys(lb[0])).not.toContain('phone');
  });

  it('排行榜头像：存储的裸引用读时重签（CR-21 stage C，可证伪）', async () => {
    entries.createQueryBuilder().getRawMany.mockResolvedValue([{ userId: 1, points: 50 }]);
    users.find.mockResolvedValue([{ id: 1, nickname: 'Alice', avatarUrl: '/uploads/a.png' }]);
    const lb = await service.getLeaderboard(20);
    const url = lb[0].avatarUrl as string;

    expect(url).not.toBe('/uploads/a.png'); // 旧形状的坏读法会把裸引用原样透传
    expect(url).toMatch(/^\/uploads\/a\.png\?e=\d+&s=/);
    const [, q] = url.split('?');
    const p = new URLSearchParams(q);
    expect(uploadSign.verify('/uploads/a.png', p.get('e')!, p.get('s')!)).toBe(true);
    expect(uploadSign.verify('/uploads/a.png', undefined, undefined)).toBe(false); // 裸引用本身不可校验
  });

  it('成就：未解锁显示进度', async () => {
    entries.find.mockResolvedValue([]);
    entries.createQueryBuilder().getRawOne.mockResolvedValue({ sum: 50 });
    const ach = await service.getAchievements(1);
    const checkin7 = ach.find((a) => a.key === 'checkin_7')!;
    const points100 = ach.find((a) => a.key === 'points_100')!;
    expect(checkin7.unlocked).toBe(false);
    expect(checkin7.progress).toBe(0);
    expect(points100.unlocked).toBe(false);
    expect(points100.progress).toBe(50);
  });

  it('成就用毛累计正分：admin 扣分不回退进度（A5）', async () => {
    entries.find.mockResolvedValue([]);
    // _earnedTotal 只累计 points > 0；净余额即使被扣到 50，毛累计仍到 1000
    entries.createQueryBuilder().getRawOne.mockResolvedValue({ sum: 1000 });
    const ach = await service.getAchievements(1);
    const points1000 = ach.find((a) => a.key === 'points_1000')!;
    expect(points1000.unlocked).toBe(true);
    expect(points1000.progress).toBe(1000);
  });
});
