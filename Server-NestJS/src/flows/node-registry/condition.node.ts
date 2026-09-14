// SPDX-License-Identifier: Apache-2.0

import { ConditionNode } from '../flow-definition.types';

/**
 * Condition 节点（FLOW-2）：安全求值条件表达式。
 * 支持 {{field}} 占位符替换 + == != > < >= <= 比较（数值或字符串）。
 * 表达式示例：{{days}} > 3  /  {{type}} == "urgent"
 */
export function evalCondition(node: ConditionNode, data: Record<string, unknown>): boolean {
  const expr = node.expr.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) =>
    String(data[k] ?? ''),
  );
  const m = expr.trim().match(/^(.*?)\s*(==|!=|>=|<=|>|<)\s*(.*)$/);
  if (!m) throw new Error(`无法解析条件表达式: ${node.expr}`);
  const l = m[1];
  // 正则已把运算符约束为下列 6 种之一；标注为字面量联合使下方 switch 穷尽（无需 default）
  const op = m[2] as '==' | '!=' | '>' | '<' | '>=' | '<=';
  const r = m[3];
  const parse = (v: string): string | number => {
    const stripped = v.trim().replace(/^"|"$/g, '');
    const num = Number(stripped);
    return Number.isNaN(num) ? stripped : num;
  };
  const lv = parse(l);
  const rv = parse(r);
  // 运算符由上方正则约束为下列 6 种之一，无其它可能（故无 default 分支）
  switch (op) {
    case '==': return lv === rv;
    case '!=': return lv !== rv;
    case '>': return (lv as number) > (rv as number);
    case '<': return (lv as number) < (rv as number);
    case '>=': return (lv as number) >= (rv as number);
    case '<=': return (lv as number) <= (rv as number);
  }
}
