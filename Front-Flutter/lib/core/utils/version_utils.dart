/// 语义化版本号（x.y.z）逐段数值比较。
/// 返回：a < b → -1；a == b → 0；a > b → 1。
int compareVersions(String a, String b) {
  final pa = _parts(a);
  final pb = _parts(b);
  for (var i = 0; i < pa.length || i < pb.length; i++) {
    final va = i < pa.length ? pa[i] : 0;
    final vb = i < pb.length ? pb[i] : 0;
    if (va != vb) return va < vb ? -1 : 1;
  }
  return 0;
}

List<int> _parts(String v) {
  final cleaned = v.trim().split('+').first; // 去掉 build number
  return cleaned
      .split('.')
      .map((s) => int.tryParse(s) ?? 0)
      .toList();
}
