// SPDX-License-Identifier: Apache-2.0

/**
 * Money formatting, single-sourced.
 *
 * The same rule previously lived in four places inside the CRM analytics service — and,
 * in a different shape, a fourth variant in the web console — which is exactly how one
 * amount ends up displayed two different ways. One rule, one place.
 *
 * 金额格式化，**单源**。
 *
 * 同一条规则此前散落在 CRM 分析服务的四处（Web 端还有形状不同的第四种），这正是同一个
 * 金额会以两种样子出现的原因。一处定义、一个规则。
 */

/**
 * The platform's display currency symbol.
 *
 * Kept as one constant so every backend caller agrees. Turning it into a runtime global
 * setting is a **separate, contract-visible** step — the public endpoints that would have
 * to carry it are registered in the wire contract — so it is tracked rather than smuggled
 * in here. This constant is the seam that step would replace.
 *
 * 平台的显示币种符号。
 *
 * 留作单一常量，使后端所有调用方一致。把它做成运行期全局设置是**另一件契约可见的事** ——
 * 需要承载它的公开端点在 wire 契约里有登记 —— 故记为待办而不是在这里顺手塞进去。
 * 这个常量就是届时会被替换掉的接缝。
 */
export const CURRENCY_SYMBOL = '¥';

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;
const DECIMAL_STRING = /^\d+(\.\d+)?$/;

/**
 * Format an amount the way the platform displays money: symbol, thousands separators and
 * a fixed number of decimals.
 *
 * `amount` takes the decimal **string** the protocol carries on the wire as well as a
 * number, and the string path never goes through a float — the whole reason those values
 * travel as strings is to keep the rounding out, and re-introducing it just to display
 * them would undo that. A value that is not a decimal number is returned with the symbol
 * attached rather than silently replaced, so the odd value stays visible.
 *
 * 按平台显示金额：符号 + 千分位 + 固定小数位。
 *
 * `amount` 接受协议在 wire 上承载的十进制**字符串**与数字；字符串路径**不经过浮点** ——
 * 那些值之所以以字符串传输就是为了避开舍入，只为了显示又把舍入引回来等于白做。
 * 非十进制数会连着符号原样返回而不是被静默替换，好让异常值保持可见。
 */
export function formatMoney(
  amount: number | string,
  opts: { symbol?: string; decimals?: number } = {},
): string {
  const symbol = opts.symbol ?? CURRENCY_SYMBOL;
  const decimals = Math.max(0, Math.trunc(opts.decimals ?? 2));
  const raw = (typeof amount === 'number' ? amount.toString() : String(amount ?? '').trim()).replace(/^\+/, '');
  const negative = raw.startsWith('-');
  const rawBody = negative ? raw.slice(1) : raw;
  // An empty value displays as zero — all three ends must agree here; they did not before
  // (Flutter said "¥.00" while TypeScript said "¥"), which is exactly the kind of drift this
  // helper exists to remove.
  // 空值按零显示 —— 三个端必须一致：此前 Flutter 给「¥.00」而 TypeScript 给「¥」，
  // 同一个空值三种结果，正是这个 helper 要消掉的那类漂移。
  const body = rawBody === '' ? '0' : rawBody;
  if (!DECIMAL_STRING.test(body)) return `${negative ? '-' : ''}${symbol}${body}`;

  const [intRaw, fracRaw = ''] = body.split('.');
  const frac = `${fracRaw}${'0'.repeat(decimals)}`.slice(0, decimals);
  const grouped = intRaw.replace(THOUSANDS, ',');
  return `${negative ? '-' : ''}${symbol}${grouped}${decimals > 0 ? `.${frac}` : ''}`;
}

/**
 * Compact form for dashboards: one decimal place plus a 万 unit from ten thousand up,
 * the plain number below it. It exists because the dashboard deliberately shows a shorter
 * shape than a detail view — the two are different presentations of one rule, not two rules.
 *
 * 看板用的紧凑形：一万起用「万」并保留一位小数，以下原样。它存在是因为看板本就刻意比
 * 明细页显示得更短 —— 两者是**同一条规则的两种呈现**，不是两条规则。
 */
export function formatMoneyCompact(amount: number | string): string {
  const value = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(value)) return `${CURRENCY_SYMBOL}${amount}`;
  const negative = value < 0;
  const abs = Math.abs(value);
  const body = abs >= 10000 ? `${(abs / 10000).toFixed(1)}万` : String(abs);
  return `${negative ? '-' : ''}${CURRENCY_SYMBOL}${body}`;
}
