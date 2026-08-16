import 'dart:convert';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:shared_preferences/shared_preferences.dart';

/// 轻量 JSON 缓存（UX-1 离线缓存）：
/// 基于 SharedPreferences 存储列表/对象 JSON，「缓存优先，网络更新」。
/// 各 feature 的 provider 在 load() 时先读缓存立即渲染，再拉网络覆盖。
class AppCache {
  final SharedPreferences? _prefs;

  AppCache(this._prefs);

  /// 无存储的降级实例：读返回 null、写 no-op（测试/未注入时安全）。
  factory AppCache.unavailable() => AppCache(null);

  /// 用 JSON 数组编码命名空间与 key，避免 `:` 拼接导致的键碰撞
  /// （如 namespace/key 含冒号时 `a:b:c` 可能被不同组合复用）。
  String _key(String namespace, String key) => jsonEncode([namespace, key]);

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
      // 任一元素非 Map 即视为整份缓存损坏，返回 null 让调用方回退网络，
      // 避免返回残缺数据误导 UI。
      final list = <Map<String, dynamic>>[];
      for (final e in decoded) {
        if (e is! Map) return null;
        list.add(Map<String, dynamic>.from(e));
      }
      return list;
    } catch (e) {
      debugPrint('[AppCache] readList 解析失败: $namespace:$key → $e');
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
    final ok = await prefs.setString(_key(namespace, key), jsonEncode(data));
    if (!ok) debugPrint('[AppCache] writeList 写入失败: $namespace:$key');
  }

  Future<void> writeInt(String namespace, String key, int value) async {
    final prefs = _prefs;
    if (prefs == null) return;
    final ok = await prefs.setInt(_key(namespace, key), value);
    if (!ok) debugPrint('[AppCache] writeInt 写入失败: $namespace:$key');
  }

  int? readInt(String namespace, String key) {
    final prefs = _prefs;
    return prefs?.getInt(_key(namespace, key));
  }

  Future<void> remove(String namespace, String key) async {
    final prefs = _prefs;
    if (prefs == null) return;
    final ok = await prefs.remove(_key(namespace, key));
    if (!ok) debugPrint('[AppCache] remove 失败: $namespace:$key');
  }

  /// 清空所有 AppCache 写入的缓存 key（登出/注销时调用，防跨账号缓存泄漏）。
  /// 仅删除 AppCache 自己的 key（`jsonEncode([namespace, key])` 数组格式），
  /// 不影响 refresh_token / theme_mode / language 等应用级 SharedPreferences 键。
  Future<void> clearAll() async {
    final prefs = _prefs;
    if (prefs == null) return;
    final keys = prefs.getKeys().where((k) {
      try {
        final decoded = jsonDecode(k);
        return decoded is List && decoded.length == 2 && decoded.every((e) => e is String);
      } catch (_) {
        return false;
      }
    }).toList();
    for (final k in keys) {
      await prefs.remove(k);
    }
  }
}
