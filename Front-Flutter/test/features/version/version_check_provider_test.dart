import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/version/data/models/app_version_info.dart';
import 'package:front_app/features/version/presentation/providers/version_check_provider.dart';
import '../../helpers.dart';

void main() {
  late MockVersionRepository repository;
  late VersionCheckProvider provider;

  setUp(() {
    repository = MockVersionRepository();
  });

  AppVersionInfo info(String latest, String min) => AppVersionInfo(
        latestVersion: latest,
        minRequiredVersion: min,
        updateUrl: 'https://example.com/download',
        changelog: const ['新功能'],
      );

  test('current version behind latest → optional', () async {
    when(() => repository.getVersionInfo())
        .thenAnswer((_) async => info('1.1.0', '1.0.0'));
    provider = VersionCheckProvider(repository, currentVersion: '1.0.0');

    final decision = await provider.check();

    expect(decision, AppUpdateDecision.optional);
    expect(provider.decision, AppUpdateDecision.optional);
    expect(provider.checked, true);
  });

  test('current version below minRequired → forced', () async {
    when(() => repository.getVersionInfo())
        .thenAnswer((_) async => info('2.0.0', '1.5.0'));
    provider = VersionCheckProvider(repository, currentVersion: '1.0.0');

    final decision = await provider.check();

    expect(decision, AppUpdateDecision.forced);
  });

  test('current version up to date → none', () async {
    when(() => repository.getVersionInfo())
        .thenAnswer((_) async => info('1.0.0', '1.0.0'));
    provider = VersionCheckProvider(repository, currentVersion: '1.0.0');

    final decision = await provider.check();

    expect(decision, AppUpdateDecision.none);
  });

  test('network failure → none (does not block)', () async {
    when(() => repository.getVersionInfo()).thenThrow(Exception('down'));
    provider = VersionCheckProvider(repository, currentVersion: '1.0.0');

    final decision = await provider.check();

    expect(decision, AppUpdateDecision.none);
    expect(provider.checked, true);
  });

  test('version check notifies listeners', () async {
    when(() => repository.getVersionInfo())
        .thenAnswer((_) async => info('1.1.0', '1.0.0'));
    provider = VersionCheckProvider(repository, currentVersion: '1.0.0');
    var notified = 0;
    provider.addListener(() => notified++);

    await provider.check();

    expect(notified, greaterThanOrEqualTo(1));
  });
}
