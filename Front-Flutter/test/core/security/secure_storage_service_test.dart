import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/constants/app_constants.dart';
import 'package:front_app/core/security/secure_storage_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // 测试环境无原生插件 → FlutterSecureStorage 抛 MissingPluginException，
  // SecureStorageService 会回退到内存兜底，无需 mock 原生存储。
  group('SecureStorageService（内存兜底）', () {
    test('write 后 read 返回同一值', () async {
      final service = SecureStorageService();
      await service.write('k1', 'v1');
      expect(await service.read('k1'), 'v1');
    });

    test('write 覆盖旧值', () async {
      final service = SecureStorageService();
      await service.write('k1', 'old');
      await service.write('k1', 'new');
      expect(await service.read('k1'), 'new');
    });

    test('read 不存在的 key 返回 null', () async {
      final service = SecureStorageService();
      expect(await service.read('missing'), isNull);
    });

    test('delete 移除值', () async {
      final service = SecureStorageService();
      await service.write('k1', 'v1');
      await service.delete('k1');
      expect(await service.read('k1'), isNull);
    });

    test('clear 清空所有键', () async {
      final service = SecureStorageService();
      await service.write('a', '1');
      await service.write('b', '2');
      await service.clear();
      expect(await service.read('a'), isNull);
      expect(await service.read('b'), isNull);
    });

    test('getOrCreateDeviceId 生成 32 位 hex 且稳定', () async {
      final service = SecureStorageService();
      final id = await service.getOrCreateDeviceId();
      expect(RegExp(r'^[0-9a-f]{32}$').hasMatch(id), isTrue);

      final id2 = await service.getOrCreateDeviceId();
      expect(id2, id); // 同实例重复调用返回同一个 id
    });

    test('getOrCreateDeviceId 使用已存的 device_id', () async {
      final service = SecureStorageService();
      await service.write(AppConstants.keyDeviceId, 'abc');
      final id = await service.getOrCreateDeviceId();
      expect(id, 'abc');
    });
  });
}
