// SPDX-License-Identifier: Apache-2.0

/**
 * Money formatting for the web console — the one place this rule lives.
 *
 * It used to live in four places here (a local `formatMoney` inside the CRM dashboard plus
 * three inline `¥…toFixed()` sites, at two different precisions), which is how the same
 * amount ends up reading differently depending on which page you are on. The rule now
 * matches the backend's `common/utils/money.ts` exactly.
 *
 * Web 管理台的金额格式化 —— 这条规则在本端的唯一出处。
 *
 * 它此前散在这里的四处（CRM 看板里一个局部 `formatMoney`，加上三处内联 `¥…toFixed()`，
 * 还用了两种精度），这正是同一个金额在不同页面读起来不一样的原因。规则与后端的
 * `common/utils/money.ts` 完全一致。
 */

/**
 * The platform's display currency symbol. One constant so every caller agrees; making it a
 * runtime global setting is a separate, contract-visible step (the public endpoint that
 * would carry it is registered in the wire contract), so it is tracked rather than assumed.
 *
 * 平台的显示币种符号。留作单一常量使所有调用方一致；把它做成运行期全局设置是另一件
 * **契约可见**的事（需要承载它的公开端点在 wire 契约里已登记），故记为待办而不是想当然。
 */
export const CURRENCY_SYMBOL = '¥';

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;
const DECIMAL_STRING = /^\d+(\.\d+)?$/;

/**
 * Format an amount as the platform displays money: symbol, thousands separators and a fixed
 * number of decimals. Unlike the backend's version this takes a number — the console talks
 * JSON, where these values have already become numbers — but the grouping and padding rule
 * is the same one.
 *
 * 按平台显示金额：符号 + 千分位 + 固定小数位。与后端版本不同的是这里收数字 —— 管理台说
 * JSON，这些值到了这里已经是数字 —— 但分组与补位规则是同一条。
 */
export function formatMoney(
  amount: number | null | undefined,
  opts: { symbol?: string; decimals?: number } = {},
): string {
  const symbol = opts.symbol ?? CURRENCY_SYMBOL;
  const decimals = Math.max(0, Math.trunc(opts.decimals ?? 2));
  const raw = String(amount ?? '').trim();
  const negative = raw.startsWith('-');
  const rawBody = negative ? raw.slice(1) : raw;
  // 空值按零显示 —— 三个端必须一致（此前 TypeScript 给「¥」而 Flutter 给「¥.00」）。
  const body = rawBody === '' ? '0' : rawBody;
  if (!DECIMAL_STRING.test(body)) return `${negative ? '-' : ''}${symbol}${body}`;

  const [intRaw, fracRaw = ''] = body.split('.');
  const frac = `${fracRaw}${'0'.repeat(decimals)}`.slice(0, decimals);
  return `${negative ? '-' : ''}${symbol}${intRaw.replace(THOUSANDS, ',')}${decimals > 0 ? `.${frac}` : ''}`;
}

/**
 * Compact form for dashboards: one decimal place plus a 万 unit from ten thousand up, the
 * plain number below it. It exists because a dashboard card deliberately shows a shorter
 * shape than a detail view — two presentations of one rule, not two rules.
 *
 * 看板用的紧凑形：一万起用「万」并保留一位小数，以下原样。它存在是因为看板卡片本就刻意
 * 比明细页显示得更短 —— 同一条规则的两种呈现，不是两条规则。
 */
export function formatMoneyCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return `${CURRENCY_SYMBOL}0`;
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const body = abs >= 10000 ? `${(abs / 10000).toFixed(1)}万` : String(abs);
  return `${negative ? '-' : ''}${CURRENCY_SYMBOL}${body}`;
}
