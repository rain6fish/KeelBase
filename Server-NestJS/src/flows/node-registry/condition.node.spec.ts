import { evalCondition } from './condition.node';

describe('evalCondition（FLOW-2 条件节点）', () => {
  it('占位符替换后数值比较', () => {
    expect(evalCondition({ expr: '{{days}} > 3' } as any, { days: 5 })).toBe(true);
    expect(evalCondition({ expr: '{{days}} > 3' } as any, { days: 2 })).toBe(false);
    expect(evalCondition({ expr: '{{days}} >= 3' } as any, { days: 3 })).toBe(true);
  });

  it('字符串占位符 + 引号解析', () => {
    expect(evalCondition({ expr: '{{type}} == "urgent"' } as any, { type: 'urgent' })).toBe(true);
    expect(evalCondition({ expr: '{{type}} == "urgent"' } as any, { type: 'normal' })).toBe(false);
    expect(evalCondition({ expr: '{{type}} != "urgent"' } as any, { type: 'normal' })).toBe(true);
  });

  it('缺失字段替换为空串', () => {
    // {{missing}} → ''，与 '0' 比较：Number('')=0 → ''=='0'? parse('') → Number('')=0 → 0 == 0 true
    expect(evalCondition({ expr: '{{missing}} == "0"' } as any, {})).toBe(true);
  });

  it('< <= 比较', () => {
    expect(evalCondition({ expr: '{{n}} < 10' } as any, { n: 5 })).toBe(true);
    expect(evalCondition({ expr: '{{n}} <= 10' } as any, { n: 10 })).toBe(true);
    expect(evalCondition({ expr: '{{n}} < 10' } as any, { n: 15 })).toBe(false);
  });

  it('表达式无法解析抛错', () => {
    expect(() => evalCondition({ expr: '{{x}}' } as any, { x: 'a' })).toThrow('无法解析条件表达式');
  });
});
