// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Setting } from './settings.entity';
import { SettingsService } from './settings.service';

function mockRepo() {
  const rows = new Map<string, Setting>();
  return {
    find: jest.fn(async () => Array.from(rows.values())),
    findOne: jest.fn(async ({ where: { key } }: any) => rows.get(key) ?? null),
    create: jest.fn((data: Partial<Setting>) => data as Setting),
    save: jest.fn(async (row: Setting) => {
      rows.set(row.key, row);
      return row;
    }),
  };
}

describe('SettingsService', () => {
  let service: SettingsService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getRepositoryToken(Setting), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(SettingsService);
    await service.onModuleInit();
  });

  it('空表时 get 返回 undefined，带默认值返回默认', async () => {
    expect(await service.get('missing')).toBeUndefined();
    expect(await service.getWithDefault('missing', true)).toBe(true);
  });

  it('set boolean 后按 boolean 解析', async () => {
    await service.set('maintenance_mode', true);
    expect(await service.get('maintenance_mode')).toBe(true);
    expect(await service.isMaintenanceMode()).toBe(true);
  });

  it('set number 后按 number 解析', async () => {
    await service.set('ai_daily_limit', 100);
    expect(await service.getAiDailyLimit()).toBe(100);
  });

  it('set 已有 key 更新而非新建', async () => {
    await service.set('maintenance_mode', false);
    await service.set('maintenance_mode', true);
    expect(repo.save).toHaveBeenCalledTimes(2);
    expect(repo.find).toHaveBeenCalled();
    expect(await service.isMaintenanceMode()).toBe(true);
  });

  it('findAll 返回全部配置', async () => {
    await service.set('a', 'x');
    await service.set('b', 2);
    const all = await service.findAll();
    expect(all.length).toBe(2);
  });

  it('onModuleInit 失败（表未建）时不抛，get 回退查库/默认值', async () => {
    repo.find.mockRejectedValueOnce(new Error('no such table'));
    await service.resetCache();
    repo.findOne.mockResolvedValue(null);
    expect(await service.getWithDefault('k', 5)).toBe(5);
  });

  it('onChange：每次 set 成功都触发监听器（key 过滤由调用方负责，如热更新只认 ai_proxy_tools）', async () => {
    const listener = jest.fn();
    service.onChange(listener);
    await service.set('ai_proxy_tools', '{"tools":[]}');
    await service.set('other_key', 'x');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, 'ai_proxy_tools');
    expect(listener).toHaveBeenNthCalledWith(2, 'other_key');
  });

  it('onChange：监听器抛异常不阻断 set（fire-and-forget）', async () => {
    service.onChange(() => {
      throw new Error('reload 失败');
    });
    await expect(service.set('maintenance_mode', true)).resolves.toBeDefined();
    expect(await service.isMaintenanceMode()).toBe(true);
  });
});
