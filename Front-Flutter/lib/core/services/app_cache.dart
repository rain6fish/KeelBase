import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// 轻量 JSON 缓存（UX-1 离线缓存）：
/// 基于 SharedPreferences 存储列表/对象 JSON，「缓存优先，网络更新」。
/// 各 feature 的 provider 在 load() 时先读缓存立即渲染，再拉网络覆盖。
class AppCache {
  final SharedPreferences? _prefs;

  AppCache(this._prefs);

  /// 无存储的降级实例：读返回 null、写 no-op（测试/未注入时安全）。
  factory AppCache.unavailable() => AppCache(null);

  String _key(String namespace, String key) => '$namespace:$key';

  /// 读缓存列表；无缓存或损坏时返回 null（调用方回退空列表）。
  Future<List<Map<String, dynamic>>?> readList(
    String namespace,
    String key,
  ) async {
    final prefs = _prefs;
    if (prefs == null) return null;
    final raw = prefs.getString(_key(namespace, key));
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return null;
      return decoded
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return null;
    }
  }

  Future<void> writeList(
    String namespace,
    String key,
    List<Map<String, dynamic>> data,
  ) async {
    final prefs = _prefs;
    if (prefs == null) return;
    await prefs.setString(_key(namespace, key), jsonEncode(data));
  }

  Future<void> writeInt(String namespace, String key, int value) async {
    final prefs = _prefs;
    if (prefs == null) return;
    await prefs.setInt(_key(namespace, key), value);
  }

  int? readInt(String namespace, String key) {
    final prefs = _prefs;
    return prefs?.getInt(_key(namespace, key));
  }

  Future<void> remove(String namespace, String key) async {
    final prefs = _prefs;
    if (prefs == null) return;
    await prefs.remove(_key(namespace, key));
  }
}
