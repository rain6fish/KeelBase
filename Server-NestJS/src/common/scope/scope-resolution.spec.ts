// SPDX-License-Identifier: Apache-2.0

import { ForbiddenException } from '@nestjs/common';
import { assertCallerIdentity, orgContextOf, resolveScopeDescriptor } from './scope-resolution';

/**
 * These two helpers were extracted from `TodosService` and `EventsService`, where they existed as
 * identical private copies — and where a third and fourth copy were about to be generated into every
 * module that declares a `scope`. What is worth pinning here is not the happy path (todos' and
 * events' own specs cover the behaviour end to end) but the **degradation**: a caller constructed
 * without an org service, and an org lookup that throws, must both come back as "no organisation"
 * rather than as an error or, worse, as a wider scope.
 *
 * 这两个助手是从 `TodosService` 与 `EventsService` 抽出来的 —— 在那之前它们是两份一模一样的私有副本，
 * 而第三、第四份正要被生成进每一个声明 `scope` 的模块。这里值得钉住的不是顺利路径（todos/events 自己的
 * spec 已端到端覆盖），而是**降级**：没有组织服务的调用方、以及组织查询抛错的情形，都必须回到「没有组织」，
 * 而不是报错、更不是放宽。
 */
describe('orgContextOf', () => {
  it('没有组织服务 / 没有 userId → null（未接线的部署与单测走这条）', async () => {
    expect(await orgContextOf(undefined, 5)).toBeNull();
    expect(await orgContextOf({ getUserOrgContext: jest.fn() } as never, undefined)).toBeNull();
  });

  it('组织查询抛错 → null，而不是把错误抛给列表请求', async () => {
    const org = { getUserOrgContext: jest.fn().mockRejectedValue(new Error('db down')) };

    expect(await orgContextOf(org as never, 5)).toBeNull();
  });

  it('有则原样返回上下文', async () => {
    const org = { getUserOrgContext: jest.fn().mockResolvedValue({ orgId: 7, deptId: 9 }) };

    expect(await orgContextOf(org as never, 5)).toEqual({ orgId: 7, deptId: 9 });
  });
});

describe('resolveScopeDescriptor', () => {
  it('有角色配置来源 → 交给它（配置缺失只会收紧，见 DataScopeService）', async () => {
    const descriptor = { userId: 5, orgId: 7, deptId: null, level: 'own_dept_and_below', deptSubtreeIds: [9] };
    const dataScope = { resolve: jest.fn().mockResolvedValue(descriptor) };

    await expect(resolveScopeDescriptor(5, 'Todo', undefined, dataScope as never)).resolves.toEqual(descriptor);
    expect(dataScope.resolve).toHaveBeenCalledWith(5, 'Todo');
  });

  it('没有配置来源 → 内置默认 + 组织上下文', async () => {
    const org = { getUserOrgContext: jest.fn().mockResolvedValue({ orgId: 7, deptId: null }) };

    const descriptor = await resolveScopeDescriptor(5, 'Todo', org as never, undefined);

    expect(descriptor).toMatchObject({ userId: 5, orgId: 7, deptId: null, level: 'org' });
  });
});

describe('assertCallerIdentity', () => {
  it('有身份 → 放行', () => {
    expect(() => assertCallerIdentity(5, '搜索')).not.toThrow();
  });

  it('缺席（undefined / null）→ 拒绝，而不是让调用方退回更宽的范围', () => {
    expect(() => assertCallerIdentity(undefined as unknown as number, '搜索')).toThrow(ForbiddenException);
    expect(() => assertCallerIdentity(null as unknown as number, '搜索')).toThrow(ForbiddenException);
  });

  it('非数字 → 拒绝（`Number(userId)` 的 NaN 不得静默成为一个合法主体）', () => {
    expect(() => assertCallerIdentity(Number('abc'), '搜索')).toThrow(ForbiddenException);
  });

  it('措辞带上动作名，好让拒绝可归因', () => {
    expect(() => assertCallerIdentity(undefined as unknown as number, '读取待办')).toThrow(/读取待办/);
  });
});
