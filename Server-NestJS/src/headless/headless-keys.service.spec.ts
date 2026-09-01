// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { HeadlessApiKey } from './headless-api-key.entity';
import { HeadlessKeysService } from './headless-keys.service';
import { UsersService } from '../users/users.service';

describe('HeadlessKeysService（HS-4 治理）', () => {
  let service: HeadlessKeysService;
  let repo: {
    findOne: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  const usersService = {
    findOne: jest.fn().mockResolvedValue({ id: 1 }),
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((d: any) => d),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        HeadlessKeysService,
        { provide: getRepositoryToken(HeadlessApiKey), useValue: repo },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = module.get(HeadlessKeysService);
  });

  describe('hashKey / generateKey', () => {
    it('hash 稳定且 64 hex', () => {
      const h1 = HeadlessKeysService.hashKey('abc');
      expect(h1).toBe(HeadlessKeysService.hashKey('abc'));
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });
    it('generateKey 不落明文可哈希', () => {
      const k = HeadlessKeysService.generateKey();
      expect(k.length).toBeGreaterThan(20);
    });
  });

  describe('authenticate', () => {
    it('env 单 key 匹配 → 默认上下文（admin owner）', async () => {
      const ctx = await service.authenticate('secret', 'secret');
      expect(ctx.name).toBe('default');
      expect(ctx.ownerUserId).toBe(1);
      expect(ctx.quotaPerDay).toBe(0);
    });

    it('env 不匹配且库内无 → 拒绝', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.authenticate('bad', 'secret')).rejects.toThrow(UnauthorizedException);
    });

    it('库内 key 命中 → 返回上下文并计数', async () => {
      const keyRow = {
        id: 3,
        keyHash: 'h',
        name: 'my-key',
        ownerUserId: 5,
        toolWhitelist: '["query_events"]',
        quotaPerDay: 10,
        quotaDate: 0,
        dailyUsed: 0,
        enabled: true,
      };
      repo.findOne.mockResolvedValue(keyRow);
      repo.update.mockResolvedValue({ affected: 1, raw: {} });
      const ctx = await service.authenticate('k', '');
      expect(ctx.ownerUserId).toBe(5);
      expect(ctx.toolWhitelist).toEqual(['query_events']);
      // 日切换（quotaDate=0）→ 重置 update（id 条件）+ 原子递增 update（where dailyUsed<10）
      expect(repo.update).toHaveBeenCalledTimes(2);
      expect(repo.update.mock.calls[0][0]).toBe(3); // 重置以 id 为条件
      const bumpCriteria = repo.update.mock.calls[1][0];
      expect(bumpCriteria.id).toBe(3);
      expect(JSON.stringify(bumpCriteria.dailyUsed)).toContain('10');
    });

    it('配额用尽 → 原子 update affected=0 拒绝', async () => {
      const keyRow = {
        id: 3, keyHash: 'h', name: 'k', ownerUserId: 5,
        toolWhitelist: null, quotaPerDay: 1, quotaDate: Math.floor(Date.now() / 86400000),
        dailyUsed: 1, enabled: true,
      };
      repo.findOne.mockResolvedValue(keyRow);
      repo.update.mockResolvedValue({ affected: 0, raw: {} }); // where dailyUsed<1 不命中
      await expect(service.authenticate('k', '')).rejects.toThrow(/配额/);
    });

    it('不限配额（quotaPerDay=0）不设 where，affected=1 正常通过', async () => {
      const keyRow = {
        id: 5, keyHash: 'h', name: 'k', ownerUserId: 5,
        toolWhitelist: null, quotaPerDay: 0, quotaDate: Math.floor(Date.now() / 86400000),
        dailyUsed: 100, enabled: true,
      };
      repo.findOne.mockResolvedValue(keyRow);
      repo.update.mockResolvedValue({ affected: 1, raw: {} });
      const ctx = await service.authenticate('k', '');
      expect(ctx.quotaPerDay).toBe(0);
      const bumpCall = repo.update.mock.calls.find((c) => c[1] && typeof c[1].dailyUsed === 'function');
      expect(bumpCall[0].id).toBe(5);
      expect(bumpCall[0].dailyUsed).toBeUndefined(); // 不限配额无 dailyUsed where
    });
  });

  describe('create / list / update / remove', () => {
    it('authenticate 已禁用 key → 拒绝', async () => {
      repo.findOne.mockResolvedValue({ id: 1, enabled: false, keyHash: 'h' });
      await expect(service.authenticate('some-key', '')).rejects.toThrow(UnauthorizedException);
    });

    it('list 返回全部 key 并解析 toolWhitelist', async () => {
      repo.find.mockResolvedValue([
        {
          id: 1, name: 'k1', ownerUserId: 5, toolWhitelist: '["query_events"]',
          quotaPerDay: 10, dailyUsed: 2, enabled: true, lastUsedAt: null, createdAt: new Date(),
        },
        { id: 2, name: 'k2', ownerUserId: 6, toolWhitelist: null, quotaPerDay: 0, dailyUsed: 0, enabled: true, lastUsedAt: null, createdAt: new Date() },
      ]);
      const list = await service.list();
      expect(list).toHaveLength(2);
      expect(list[0].toolWhitelist).toEqual(['query_events']);
      expect(list[1].toolWhitelist).toBeNull();
    });

    it('update 成功更新全部字段', async () => {
      const key = { id: 1, name: 'old', ownerUserId: 1, toolWhitelist: null, quotaPerDay: 0, enabled: true };
      repo.findOne.mockResolvedValue(key);
      repo.save.mockImplementation(async (k: any) => k);
      const result = await service.update(1, {
        name: 'new', ownerUserId: 9, toolWhitelist: ['query_events'], quotaPerDay: 50, enabled: false,
      });
      expect(result).toMatchObject({
        name: 'new', ownerUserId: 9, quotaPerDay: 50, enabled: false,
      });
      expect(result.toolWhitelist).toBe(JSON.stringify(['query_events']));
    });

    it('hasStoredKeys：有/无 key 分别返回 true/false', async () => {
      repo.count.mockResolvedValue(3);
      await expect(service.hasStoredKeys()).resolves.toBe(true);
      repo.count.mockResolvedValue(0);
      await expect(service.hasStoredKeys()).resolves.toBe(false);
    });

    it('_findAdminId：usersService 抛错回退 1', async () => {
      usersService.findOne.mockRejectedValueOnce(new Error('db down'));
      const ctx = await service.authenticate('envkey', 'envkey');
      expect(ctx.ownerUserId).toBe(1);
    });

    it('create 返回明文 key（仅一次）且落库 hash', async () => {
      repo.save.mockImplementation((d: any) => Promise.resolve({ ...d, id: 1 }));
      const res = await service.create({ name: 'app1' });
      expect(res.apiKey).toBeTruthy();
      expect(repo.create).toHaveBeenCalled();
      expect(repo.create.mock.calls[0][0].keyHash).toMatch(/^[0-9a-f]{64}$/);
    });
    it('update 不存在 → NotFound', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update(9, { name: 'x' })).rejects.toThrow();
    });
    it('remove 调用 delete', async () => {
      await service.remove(4);
      expect(repo.delete).toHaveBeenCalledWith(4);
    });
  });
});
