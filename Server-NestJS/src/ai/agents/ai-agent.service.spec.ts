// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiAgent } from './ai-agent.entity';
import { AiAgentService } from './ai-agent.service';

function makeRepo() {
  const rows: AiAgent[] = [];
  return {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.name === where.name) ?? null),
    create: jest.fn((x: object) => x as AiAgent),
    save: jest.fn(async (a: AiAgent) => {
      const obj = a as any;
      if (!obj.id) {
        obj.id = rows.length + 1;
        rows.push(obj);
      } else {
        const i = rows.findIndex((r) => r.id === obj.id);
        if (i >= 0) rows[i] = obj;
      }
      return obj;
    }),
  };
}

describe('AiAgentService（D5 Agent Registry）', () => {
  it('list 返回已注册 Agent（按名升序）', async () => {
    const repo = makeRepo();
    const svc = new AiAgentService(repo as any);
    await repo.save(repo.create({ name: 'b-agent' }));
    await repo.save(repo.create({ name: 'a-agent' }));
    const list = await svc.list();
    expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    expect(list.length).toBe(2);
  });

  it('upsertFromHeadless：不存在则创建（trustLevel R1 + purpose 标注）', async () => {
    const repo = makeRepo();
    const svc = new AiAgentService(repo as any);
    const created = await svc.upsertFromHeadless([{ name: 'key-erp', ownerUserId: 3 }]);
    expect(created).toBe(1);
    const saved = await svc.list();
    expect(saved[0]).toMatchObject({ name: 'key-erp', ownerId: 3, trustLevel: 'R1', purpose: 'headless API key「key-erp」' });
  });

  it('upsertFromHeadless：已存在则更新 owner（不重复创建）', async () => {
    const repo = makeRepo();
    const svc = new AiAgentService(repo as any);
    await svc.upsertFromHeadless([{ name: 'key-erp', ownerUserId: 3 }]);
    const created = await svc.upsertFromHeadless([{ name: 'key-erp', ownerUserId: 9 }]);
    expect(created).toBe(0);
    const list = await svc.list();
    expect(list.length).toBe(1);
    expect(list[0].ownerId).toBe(9);
  });

  it('upsertFromHeadless：空名跳过', async () => {
    const repo = makeRepo();
    const svc = new AiAgentService(repo as any);
    const created = await svc.upsertFromHeadless([{ name: '' }, { name: '   ' }]);
    expect(created).toBe(0);
    expect((await svc.list()).length).toBe(0);
  });

  describe('findByAgentId（§22.16 A-5 身份链）', () => {
    it('按 name 反查 Agent 名称/信任级/用途', async () => {
      const repo = makeRepo();
      const svc = new AiAgentService(repo as any);
      await svc.upsertFromHeadless([{ name: 'key-legacy-erp', ownerUserId: 1 }]);
      const agent = await svc.findByAgentId('key-legacy-erp');
      expect(agent).toMatchObject({ name: 'key-legacy-erp', trustLevel: 'R1' });
    });

    it('未注册 → null（审计 agentId 兜底）', async () => {
      const repo = makeRepo();
      const svc = new AiAgentService(repo as any);
      expect(await svc.findByAgentId('unknown-agent')).toBeNull();
    });
  });
});
