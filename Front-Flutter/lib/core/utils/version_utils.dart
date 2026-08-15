/// 语义化版本号（SemVer 风格）比较。
/// 返回：a < b → -1；a == b → 0；a > b → 1。
///
/// 规则：
/// - 忽略前导 `v`/`V`（如 `v1.0.0`）与 build 元数据（`+xxx`）；
/// - 缺失的尾段按 0 补齐（如 `1.0` == `1.0.0`）；
/// - 核心段必须为数字；pre-release 段（`-alpha`/`-rc.1`）按 SemVer 规则比较：
///   有 pre-release 的版本 < 正式版；数字标识符 < 文本标识符；
///   数字按数值比较，文本按字典序。
/// - 非法输入（空串、核心段非数字，如 `a.b.c`）抛出 [ArgumentError]。
int compareVersions(String a, String b) {
  final pa = _parseVersion(a);
  final pb = _parseVersion(b);
  final coreA = pa.core;
  final coreB = pb.core;

  final coreLen = coreA.length > coreB.length ? coreA.length : coreB.length;
  for (var i = 0; i < coreLen; i++) {
    final va = i < coreA.length ? coreA[i] : 0;
    final vb = i < coreB.length ? coreB[i] : 0;
    if (va != vb) return va < vb ? -1 : 1;
  }

  final preA = pa.pre;
  final preB = pb.pre;
  if (preA.isEmpty && preB.isEmpty) return 0;
  if (preA.isEmpty) return 1; // 正式版 > pre-release
  if (preB.isEmpty) return -1;

  final preLen = preA.length < preB.length ? preA.length : preB.length;
  for (var i = 0; i < preLen; i++) {
    final x = preA[i];
    final y = preB[i];
    if (x is int) {
      if (y is int) {
        if (x != y) return x < y ? -1 : 1;
      } else {
        return -1; // 数字标识符 < 文本标识符
      }
    } else {
      if (y is int) return 1;
      final c = (x as String).compareTo(y as String);
      if (c != 0) return c < 0 ? -1 : 1;
    }
  }
  if (preA.length != preB.length) return preA.length < preB.length ? -1 : 1;
  return 0;
}

typedef _ParsedVersion = ({List<int> core, List<Object> pre});

_ParsedVersion _parseVersion(String input) {
  var v = input.trim();
  if (v.isEmpty) {
    throw ArgumentError.value(input, 'version', '版本号不能为空');
  }
  v = v.replaceFirst(RegExp(r'^[vV]'), ''); // 去掉前导 v/V
  final plus = v.indexOf('+');
  if (plus >= 0) v = v.substring(0, plus); // 去掉 build number

  var coreStr = v;
  var preStr = '';
  final minus = v.indexOf('-');
  if (minus >= 0) {
    coreStr = v.substring(0, minus);
    preStr = v.substring(minus + 1);
  }

  final core = <int>[];
  for (final seg in coreStr.split('.')) {
    final n = int.tryParse(seg.trim());
    if (n == null) {
      throw ArgumentError.value(input, 'version', '非数字核心段: "$seg"');
    }
    core.add(n);
  }

  final pre = <Object>[];
  if (preStr.isNotEmpty) {
    for (final seg in preStr.split('.')) {
      final n = int.tryParse(seg.trim());
      if (n != null) {
        pre.add(n);
      } else {
        pre.add(seg.trim());
      }
    }
  }
  return (core: core, pre: pre);
}
