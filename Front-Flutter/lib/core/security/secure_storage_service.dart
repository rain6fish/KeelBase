import 'dart:math';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/app_constants.dart';

/// Secure storage wrapper with web fallback.
/// On mobile (iOS/Android): uses Keychain/KeyStore via flutter_secure_storage.
/// On web: falls back to SharedPreferences (persists across page refreshes),
/// scoped under a `sec_` prefix; an in-memory map is kept as a last-resort
/// safety net when the prefs backend is unavailable.
class SecureStorageService {
  /// Web fallback 键前缀：与主题/语言等普通 prefs 隔离，`clear()` 只清本命名空间。
  static const String _webKeyPrefix = 'sec_';

  final FlutterSecureStorage? _nativeStorage;
  final Map<String, String> _memoryFallback = {};

  Future<SharedPreferences>? _prefsFuture;
  Future<String>? _deviceIdFuture;

  SecureStorageService()
      : _nativeStorage = kIsWeb ? null : const FlutterSecureStorage();

  Future<SharedPreferences> _prefs() =>
      _prefsFuture ??= SharedPreferences.getInstance();

  static String _webKey(String key) => '$_webKeyPrefix$key';

  Future<void> write(String key, String value) async {
    if (_nativeStorage != null) {
      try {
        await _nativeStorage.write(key: key, value: value);
        return;
      } catch (_) {
        // Keychain/KeyStore 失败：回退到内存，保证启动不被阻塞
      }
    } else {
      // Web：优先持久化到 SharedPreferences，失败再落内存
      try {
        final prefs = await _prefs();
        final ok = await prefs.setString(_webKey(key), value);
        if (ok) return;
      } catch (_) {
        // ignore: fall through to in-memory
      }
    }
    _memoryFallback[key] = value;
  }

  Future<String?> read(String key) async {
    if (_nativeStorage != null) {
      try {
        return await _nativeStorage.read(key: key);
      } catch (_) {
        return _memoryFallback[key];
      }
    }
    try {
      final prefs = await _prefs();
      final value = prefs.getString(_webKey(key));
      if (value != null) return value;
    } catch (_) {
      // ignore: fall through to in-memory
    }
    return _memoryFallback[key];
  }

  Future<void> delete(String key) async {
    if (_nativeStorage != null) {
      try {
        await _nativeStorage.delete(key: key);
        return;
      } catch (_) {
        // ignore: fall through to in-memory
      }
    } else {
      try {
        final prefs = await _prefs();
        await prefs.remove(_webKey(key));
      } catch (_) {
        // ignore: fall through to in-memory
      }
    }
    _memoryFallback.remove(key);
  }

  Future<void> clear() async {
    if (_nativeStorage != null) {
      try {
        await _nativeStorage.deleteAll();
        return;
      } catch (_) {
        // ignore: fall through to in-memory
      }
    } else {
      try {
        final prefs = await _prefs();
        // 只清本命名空间，避免误删主题/语言等普通 prefs
        final keys = prefs
            .getKeys()
            .where((k) => k.startsWith(_webKeyPrefix))
            .toList();
        for (final k in keys) {
          await prefs.remove(k);
        }
      } catch (_) {
        // ignore: fall through to in-memory
      }
    }
    _memoryFallback.clear();
  }

  /// Get or create a persistent device identifier.
  /// The ID is a random hex string generated once and stored for the lifetime
  /// of the app installation (persisted on web via SharedPreferences).
  ///
  /// Memoizes the in-flight future so concurrent callers share one generated ID
  /// (avoids the read-modify-write TOCTOU race); the memo is cleared on failure
  /// so a later call can retry.
  Future<String> getOrCreateDeviceId() {
    if (_deviceIdFuture == null) {
      final future = _doGetOrCreateDeviceId();
      _deviceIdFuture = future;
      // 失败时清除缓存，允许下次重试（错误仍会传递给 await 的调用方）
      future.then<void>((_) {}, onError: (Object _) {
        _deviceIdFuture = null;
      });
    }
    return _deviceIdFuture!;
  }

  Future<String> _doGetOrCreateDeviceId() async {
    final existing = await read(AppConstants.keyDeviceId);
    if (existing != null && existing.isNotEmpty) return existing;

    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    final id = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    await write(AppConstants.keyDeviceId, id);
    return id;
  }
}
