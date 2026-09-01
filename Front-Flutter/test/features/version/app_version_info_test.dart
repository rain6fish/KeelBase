// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/version/data/models/app_version_info.dart';

void main() {
  test('fromJson 解析版本信息', () {
    final v = AppVersionInfo.fromJson({
      'latestVersion': '1.2.0',
      'minRequiredVersion': '1.0.0',
      'updateUrl': 'https://example.com/app',
      'changelog': ['修复 bug', '新功能'],
    });
    expect(v.latestVersion, '1.2.0');
    expect(v.minRequiredVersion, '1.0.0');
    expect(v.updateUrl, 'https://example.com/app');
    expect(v.changelog, hasLength(2));
  });

  test('缺字段时回退空值', () {
    final v = AppVersionInfo.fromJson({});
    expect(v.latestVersion, '');
    expect(v.minRequiredVersion, '');
    expect(v.changelog, isEmpty);
  });
}
