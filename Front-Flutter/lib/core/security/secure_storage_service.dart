import 'dart:math';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/app_constants.dart';

/// Secure storage wrapper with web fallback.
/// On mobile (iOS/Android): uses Keychain/KeyStore via flutter_secure_storage.
/// On web: uses a simple in-memory Map.
class SecureStorageService {
  final FlutterSecureStorage? _nativeStorage;
  final Map<String, String> _fallback = {};

  SecureStorageService()
      : _nativeStorage = kIsWeb ? null : const FlutterSecureStorage();


  Future<void> write(String key, String value) async {
    if (_nativeStorage != null) {
      return _nativeStorage!.write(key: key, value: value);
    }
    _fallback[key] = value;
  }

  Future<String?> read(String key) async {
    if (_nativeStorage != null) {
      return _nativeStorage!.read(key: key);
    }
    return _fallback[key];
  }

  Future<void> delete(String key) async {
    if (_nativeStorage != null) {
      return _nativeStorage!.delete(key: key);
    }
    _fallback.remove(key);
  }

  Future<void> clear() async {
    if (_nativeStorage != null) {
      return _nativeStorage!.deleteAll();
    }
    _fallback.clear();
  }

  /// Get or create a persistent device identifier.
  /// The ID is a random hex string generated once and stored for the lifetime
  /// of the app installation.
  Future<String> getOrCreateDeviceId() async {
    final existing = await read(AppConstants.keyDeviceId);
    if (existing != null && existing.isNotEmpty) return existing;

    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    final id = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    await write(AppConstants.keyDeviceId, id);
    return id;
  }
}
