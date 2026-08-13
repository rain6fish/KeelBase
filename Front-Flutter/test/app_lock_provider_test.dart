import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:front_app/core/services/app_lock_provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('AppLockProvider 默认关闭', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final provider = AppLockProvider(prefs);
    expect(provider.enabled, isFalse);
  });

  test('AppLockProvider 开启后持久化到 prefs', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final provider = AppLockProvider(prefs);

    // 测试环境无生物识别：setEnabled(true) 应返回 false（不支持则不能开启）
    final ok = await provider.setEnabled(true);
    expect(ok, isFalse); // 无生物识别的环境不允许开启
    expect(provider.enabled, isFalse);
  });

  test('AppLockProvider authenticate 未开启时直接通过', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final provider = AppLockProvider(prefs);
    // 未开启 → 不触发生物识别，直接通过
    final ok = await provider.authenticate();
    expect(ok, isTrue);
    expect(provider.checkedOnce, isTrue);
  });

  test('AppLockProvider 从 prefs 恢复已开启状态', () async {
    SharedPreferences.setMockInitialValues({'app_lock_enabled': true});
    final prefs = await SharedPreferences.getInstance();
    final provider = AppLockProvider(prefs);
    expect(provider.enabled, isTrue);
  });
}
