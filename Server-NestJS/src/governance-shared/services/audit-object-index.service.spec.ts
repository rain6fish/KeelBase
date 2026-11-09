// SPDX-License-Identifier: Apache-2.0

import { AuditObjectIndexService } from './audit-object-index.service';

/**
 * The object index either resolves through the write claim or says it cannot. The second half is
 * the one worth pinning: an unavailable index that answers `[]` is indistinguishable from «no
 * match», and that false negative is exactly what the controller's 503 exists to prevent.
 *
 * 对象索引要么经写占位行解析出来，要么明说解析不了。值得钉的是后一半：不可用的索引若答 `[]`，就与
 * 「无匹配」无法区分 —— 而这个假阴性正是控制器那条 503 要挡住的东西。
 */
describe('AuditObjectIndexService', () => {
  it('reports itself unavailable when the process has no write-claim repository', async () => {
    const service = new AuditObjectIndexService(undefined, { find: jest.fn() } as never);
    expect(service.available).toBe(false);
    expect(await service.auditRowIdsFor('crm_customer', 9005)).toEqual([]);
  });

  it('walks effect → claim → audit row, de-duplicated', async () => {
    const claimsRepo = {
      find: jest.fn().mockResolvedValue([
        { auditRowId: 11, effectId: 3 },
        { auditRowId: 11, effectId: 4 },
        { auditRowId: null, effectId: 5 },
      ]),
    };
    const effectsRepo = {
      find: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }, { id: 5 }]),
    };
    const service = new AuditObjectIndexService(claimsRepo as never, effectsRepo as never);

    expect(service.available).toBe(true);
    expect(await service.auditRowIdsFor('crm_customer', 9005)).toEqual([11]);
    expect(effectsRepo.find).toHaveBeenCalledWith({
      where: { resultType: 'crm_customer', resultId: 9005 },
    });
  });

  it('an object with no side-effect row is a real empty answer, not an unavailable index', async () => {
    const claimsRepo = { find: jest.fn() };
    const effectsRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = new AuditObjectIndexService(claimsRepo as never, effectsRepo as never);

    expect(service.available).toBe(true);
    expect(await service.auditRowIdsFor('crm_customer', 9999)).toEqual([]);
    // No effects ⇒ there is nothing a claim could link; the second query must not run.
    // 没有副作用 ⇒ 占位行无可链接，第二条查询不该发出。
    expect(claimsRepo.find).not.toHaveBeenCalled();
  });
});
