// SPDX-License-Identifier: Apache-2.0

/// Behavioural tests for the money rule. They exist because F-11's whole point is that the
/// same rule holds on all three ends — a type check cannot show that, only running it can.
///
/// 金额规则的行为测试。它存在是因为 F-11 的要点就是**同一条规则在三端都成立** —— 类型检查
/// 证明不了这一点，只有真跑才行。
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:front_app/core/utils/money.dart';

void main() {
  group('formatMoney', () {
    test('符号、千分位与两位小数（默认）', () {
      expect(formatMoney(1234.5), '¥1,234.50');
      expect(formatMoney(7), '¥7.00');
      expect(formatMoney(1234567.89), '¥1,234,567.89');
    });

    test('接受协议在 wire 上承载的十进制字符串', () {
      expect(formatMoney('1234.5'), '¥1,234.50');
      expect(formatMoney('0.05'), '¥0.05');
    });

    test('不经过 double —— 长整数保持精确', () {
      expect(formatMoney('1234567890123456789.50'), '¥1,234,567,890,123,456,789.50');
    });

    test('按请求的小数位补零/截断', () {
      expect(formatMoney('1.2', decimals: 4), '¥1.2000');
      expect(formatMoney('1.239', decimals: 2), '¥1.23');
      expect(formatMoney('1', decimals: 0), '¥1');
    });

    test('符号在负号之后', () {
      expect(formatMoney('-1234.5'), '-¥1,234.50');
    });

    test('非十进制数连着符号原样返回，不静默替换', () {
      expect(formatMoney('待定'), '¥待定');
    });

    test('空值不抛错', () {
      expect(formatMoney(null), '¥0.00');
      expect(formatMoney(''), '¥0.00');
    });

    test('可覆盖符号（日后全局设置的接缝）', () {
      expect(formatMoney(12, symbol: '\$'), '\$12.00');
    });
  });

  // 币种符号由服务端下发（契约 v2）；端内常量只是**兜底**，不是权威。
  group('setCurrencySymbol', () {
    tearDown(() => setCurrencySymbol(fallbackCurrencySymbol));

    test('服务端下发的符号立即生效', () {
      setCurrencySymbol('\$');
      expect(currencySymbol, '\$');
      expect(formatMoney(12), '\$12.00');
    });

    test('空值/缺省被忽略 —— 早于该字段的服务端不会把兜底值清空', () {
      setCurrencySymbol('   ');
      expect(currencySymbol, fallbackCurrencySymbol);
      setCurrencySymbol(null);
      expect(currencySymbol, fallbackCurrencySymbol);
    });

    test('显式传入的 symbol 仍优先于全局值', () {
      setCurrencySymbol('\$');
      expect(formatMoney(12, symbol: '€'), '€12.00');
    });
  });
}
