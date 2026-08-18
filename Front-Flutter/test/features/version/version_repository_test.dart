import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/version/data/repositories/version_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late VersionRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = VersionRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getVersionInfo 解析版本信息', () async {
    when(() => apiClient.get('/app/version')).thenAnswer((_) async => res({
          'latestVersion': '1.2.0',
          'minRequiredVersion': '1.0.0',
          'updateUrl': 'https://example.com/app',
          'changelog': ['修复若干问题', '新增功能'],
        }));
    final info = await repository.getVersionInfo();
    expect(info.latestVersion, '1.2.0');
    expect(info.minRequiredVersion, '1.0.0');
    expect(info.updateUrl, 'https://example.com/app');
    expect(info.changelog, ['修复若干问题', '新增功能']);
  });

  test('getVersionInfo 缺省字段回退空', () async {
    when(() => apiClient.get('/app/version')).thenAnswer((_) async => res(<String, dynamic>{}));
    final info = await repository.getVersionInfo();
    expect(info.latestVersion, '');
    expect(info.changelog, isEmpty);
  });
}
