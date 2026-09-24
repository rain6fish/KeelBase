// SPDX-License-Identifier: Apache-2.0

/// Money formatting — the one place this rule lives on the mobile side.
///
/// It mirrors the backend's `common/utils/money.ts` and the web console's `utils/money.ts`,
/// including the deliberate choice to format the decimal **string** the protocol carries
/// instead of parsing it into a double: those values travel as strings precisely so the
/// rounding stays out, and parsing them back just to display them would undo that.
///
/// 金额格式化 —— 移动端这条规则的唯一出处。
///
/// 与后端 `common/utils/money.ts`、Web 端 `utils/money.ts` 同一条规则，包括那个刻意的选择：
/// 直接格式化协议承载的十进制**字符串**，不解析成 double —— 那些值以字符串传输正是为了
/// 不引入舍入，只为显示又解析回去等于白做。
library;

/// The platform's display currency symbol.
///
/// One constant so every caller agrees. Making it a runtime global setting is a separate,
/// contract-visible step — the public endpoint that would carry it is registered in the
/// wire contract — so it is tracked rather than assumed.
///
/// 平台的显示币种符号。
///
/// 留作单一常量使所有调用方一致。把它做成运行期全局设置是另一件**契约可见**的事 ——
/// 需要承载它的公开端点在 wire 契约里已登记 —— 故记为待办而不是想当然。
const String currencySymbol = '¥';

/// [n] 个零。Dart 没有字符串乘法，这是替代写法。
String _zeros(int n) => n <= 0 ? '' : List.filled(n, '0').join();

const _decimalString = r'^\d+(\.\d+)?$';
final _thousands = RegExp(r'\B(?=(\d{3})+(?!\d))');

/// Format an amount the way the platform displays money: symbol, thousands separators and a
/// fixed number of decimals. A value that is not a decimal number is returned with the
/// symbol attached rather than silently replaced, so an odd value stays visible.
///
/// 按平台显示金额：符号 + 千分位 + 固定小数位。非十进制数会连着符号原样返回，而不是被
/// 静默替换，好让异常值保持可见。
String formatMoney(
  Object? amount, {
  String symbol = currencySymbol,
  int decimals = 2,
}) {
  final places = decimals < 0 ? 0 : decimals;
  final raw = (amount?.toString() ?? '').trim();
  final negative = raw.startsWith('-');
  final rawBody = negative ? raw.substring(1) : raw;
  final sign = negative ? '-' : '';
  // 空值按零显示 —— 三个端必须一致：此前 Dart 会给「¥.00」而 TS 会给「¥」，同一个空值
  // 三种结果，正是 F-11 要消掉的那类漂移（由 money_test.dart 实测抓出）。
  final body = rawBody.isEmpty ? '0' : rawBody;
  if (!RegExp(_decimalString).hasMatch(body)) return '$sign$symbol$body';

  final dot = body.indexOf('.');
  final intPart = dot < 0 ? body : body.substring(0, dot);
  final fracPart = dot < 0 ? '' : body.substring(dot + 1);
  final frac = '$fracPart${_zeros(places)}'.substring(0, places);
  final grouped = intPart.replaceAllMapped(_thousands, (_) => ',');
  return '$sign$symbol$grouped${places > 0 ? '.$frac' : ''}';
}
