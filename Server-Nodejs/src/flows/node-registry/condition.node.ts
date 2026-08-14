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
  const [, l, op, r] = m;
  const parse = (v: string): string | number => {
    const stripped = v.trim().replace(/^"|"$/g, '');
    const num = Number(stripped);
    return Number.isNaN(num) ? stripped : num;
  };
  const lv = parse(l);
  const rv = parse(r);
  switch (op) {
    case '==': return lv === rv;
    case '!=': return lv !== rv;
    case '>': return (lv as number) > (rv as number);
    case '<': return (lv as number) < (rv as number);
    case '>=': return (lv as number) >= (rv as number);
    case '<=': return (lv as number) <= (rv as number);
    default: return false;
  }
}
