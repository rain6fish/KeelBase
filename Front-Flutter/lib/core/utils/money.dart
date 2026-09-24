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

/// The symbol used until the server tells us which one it is.
///
/// A **fallback, not the authority**: `GET /app/capabilities` carries
/// `display.currencySymbol` (contract v2) and [setCurrencySymbol] applies it as soon as
/// capabilities load. Before that first fetch — or if it fails — this keeps amounts readable
/// instead of rendering them with nothing in front.
///
/// 服务端告知之前使用的符号。
///
/// 它是**兜底值而非权威**：`GET /app/capabilities` 承载 `display.currencySymbol`（契约 v2），
/// 能力清单加载后 [setCurrencySymbol] 会立即应用它。在首次取回之前 —— 或取回失败时 ——
/// 这个值让金额仍可读，而不是渲染成前面什么都没有。
const String fallbackCurrencySymbol = '¥';

String _currencySymbol = fallbackCurrencySymbol;

/// Apply the symbol the server published. An empty or missing value is ignored, so a server
/// that predates the field cannot blank out the fallback.
///
/// 应用服务端发布的符号。空值/缺省会被忽略，使早于该字段的服务端不会把兜底值清空。
void setCurrencySymbol(String? symbol) {
  final value = symbol?.trim() ?? '';
  if (value.isNotEmpty) _currencySymbol = value;
}

/// The symbol currently in effect: the server's once loaded, the fallback before that.
String get currencySymbol => _currencySymbol;

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
  String? symbol,
  int decimals = 2,
}) {
  final sym = symbol ?? _currencySymbol;
  final places = decimals < 0 ? 0 : decimals;
  final raw = (amount?.toString() ?? '').trim();
  final negative = raw.startsWith('-');
  final rawBody = negative ? raw.substring(1) : raw;
  final sign = negative ? '-' : '';
  // 空值按零显示 —— 三个端必须一致：此前 Dart 会给「¥.00」而 TS 会给「¥」，同一个空值
  // 三种结果，正是 F-11 要消掉的那类漂移（由 money_test.dart 实测抓出）。
  final body = rawBody.isEmpty ? '0' : rawBody;
  if (!RegExp(_decimalString).hasMatch(body)) return '$sign$sym$body';

  final dot = body.indexOf('.');
  final intPart = dot < 0 ? body : body.substring(0, dot);
  final fracPart = dot < 0 ? '' : body.substring(dot + 1);
  final frac = '$fracPart${_zeros(places)}'.substring(0, places);
  final grouped = intPart.replaceAllMapped(_thousands, (_) => ',');
  return '$sign$sym$grouped${places > 0 ? '.$frac' : ''}';
}
