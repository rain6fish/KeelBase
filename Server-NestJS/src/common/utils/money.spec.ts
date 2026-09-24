// SPDX-License-Identifier: Apache-2.0

import { CURRENCY_SYMBOL, formatMoney, formatMoneyCompact } from './money';

describe('money utils', () => {
  describe('formatMoney', () => {
    it('adds the symbol, thousands separators and two decimals by default', () => {
      expect(formatMoney(1234.5)).toBe(`${CURRENCY_SYMBOL}1,234.50`);
      expect(formatMoney(7)).toBe(`${CURRENCY_SYMBOL}7.00`);
      expect(formatMoney(1234567.89)).toBe(`${CURRENCY_SYMBOL}1,234,567.89`);
    });

    it('takes the decimal string the protocol carries on the wire', () => {
      expect(formatMoney('1234.5')).toBe(`${CURRENCY_SYMBOL}1,234.50`);
      expect(formatMoney('0.05')).toBe(`${CURRENCY_SYMBOL}0.05`);
    });

    it('does not round trip through a float — large strings stay exact', () => {
      // 19 位整数在 Number 下会失真；字符串路径必须原样保留
      expect(formatMoney('1234567890123456789.50')).toBe(`${CURRENCY_SYMBOL}1,234,567,890,123,456,789.50`);
    });

    it('pads and truncates to the requested decimals (the protocol bounds scale already)', () => {
      expect(formatMoney('1.2', { decimals: 4 })).toBe(`${CURRENCY_SYMBOL}1.2000`);
      expect(formatMoney('1.239', { decimals: 2 })).toBe(`${CURRENCY_SYMBOL}1.23`);
      expect(formatMoney('1', { decimals: 0 })).toBe(`${CURRENCY_SYMBOL}1`);
    });

    it('keeps the sign outside the symbol', () => {
      expect(formatMoney('-1234.5')).toBe(`-${CURRENCY_SYMBOL}1,234.50`);
    });

    it('shows a non-decimal value with the symbol instead of hiding it', () => {
      expect(formatMoney('待定')).toBe(`${CURRENCY_SYMBOL}待定`);
    });

    it('displays an empty value as zero — the same on every end', () => {
      // 三端此前不一致（Flutter 给「¥.00」、TypeScript 给「¥」）；这条把规则钉死。
      expect(formatMoney('')).toBe(`${CURRENCY_SYMBOL}0.00`);
      expect(formatMoney('', { decimals: 0 })).toBe(`${CURRENCY_SYMBOL}0`);
    });

    it('accepts an overriding symbol (the seam for a global setting)', () => {
      expect(formatMoney(12, { symbol: '$' })).toBe('$12.00');
    });
  });

  describe('formatMoneyCompact', () => {
    it('uses 万 from ten thousand up and stays plain below', () => {
      expect(formatMoneyCompact(12345)).toBe(`${CURRENCY_SYMBOL}1.2万`);
      expect(formatMoneyCompact(9999)).toBe(`${CURRENCY_SYMBOL}9999`);
      expect(formatMoneyCompact(10000)).toBe(`${CURRENCY_SYMBOL}1.0万`);
    });

    it('keeps the sign outside the symbol', () => {
      expect(formatMoneyCompact(-12345)).toBe(`-${CURRENCY_SYMBOL}1.2万`);
    });
  });
});
