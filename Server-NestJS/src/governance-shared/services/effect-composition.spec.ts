// SPDX-License-Identifier: Apache-2.0

import { declaredEffects } from './effect-composition';

/**
 * 复合声明解析（docs/cascade-compensation.spec.md §3）。
 * 全部非法输入都必须 fail-closed 返回 null —— 猜错就是登记了错的撤销目标，
 * 而「不误撤」正是这层治理的全部价值。
 */
describe('declaredEffects（复合写副作用声明解析）', () => {
  it('合法声明 → 原序返回（根恒为第 0 条）', () => {
    expect(
      declaredEffects({
        id: 7,
        effects: [
          { resultType: 'pm_project', resultId: 7 },
          { resultType: 'pm_task', resultId: 88 },
        ],
      }),
    ).toEqual([
      { resultType: 'pm_project', resultId: 7 },
      { resultType: 'pm_task', resultId: 88 },
    ]);
  });

  it('单成员声明也合法（复合工具只写一行时仍归组，级联语义统一）', () => {
    expect(declaredEffects({ effects: [{ resultType: 'event', resultId: 1 }] })).toEqual([
      { resultType: 'event', resultId: 1 },
    ]);
  });

  it.each([
    ['data 非对象', 'nope'],
    ['data 为数组', [{ resultType: 'event', resultId: 1 }]],
    ['无 effects 键', { id: 7 }],
    ['effects 非数组', { effects: 'x' }],
    ['effects 空数组', { effects: [] }],
    ['成员非对象', { effects: ['x'] }],
    ['成员为数组', { effects: [[1, 2]] }],
    ['缺 resultType', { effects: [{ resultId: 1 }] }],
    ['resultType 非字符串', { effects: [{ resultType: 1, resultId: 1 }] }],
    ['resultType 空串', { effects: [{ resultType: '', resultId: 1 }] }],
    ['缺 resultId', { effects: [{ resultType: 'event' }] }],
    ['resultId 非数字', { effects: [{ resultType: 'event', resultId: '1' }] }],
    ['resultId 为 NaN', { effects: [{ resultType: 'event', resultId: NaN }] }],
    ['resultId 为 Infinity', { effects: [{ resultType: 'event', resultId: Infinity }] }],
    ['混入一个非法成员（整组拒绝，不部分接受）', { effects: [{ resultType: 'event', resultId: 1 }, { resultType: 'todo' }] }],
  ])('fail-closed：%s → null', (_label, data) => {
    expect(declaredEffects(data)).toBeNull();
  });

  it('null / undefined → null', () => {
    expect(declaredEffects(null)).toBeNull();
    expect(declaredEffects(undefined)).toBeNull();
  });

  it('丢弃声明里的额外字段（只保留 resultType/resultId，防越界键流进契约）', () => {
    expect(declaredEffects({ effects: [{ resultType: 'event', resultId: 1, evil: 'x' }] })).toEqual([
      { resultType: 'event', resultId: 1 },
    ]);
  });
});
