// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/splash/data/repositories/splash_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late SplashRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = SplashRepository(apiClient);
  });

  test('存在 refresh token 时返回 true', () async {
    when(() => apiClient.refreshToken).thenAnswer((_) async => 'rt-token');
    expect(await repository.hasStoredToken(), isTrue);
  });

  test('无 refresh token 时返回 false', () async {
    when(() => apiClient.refreshToken).thenAnswer((_) async => null);
    expect(await repository.hasStoredToken(), isFalse);
  });
}
