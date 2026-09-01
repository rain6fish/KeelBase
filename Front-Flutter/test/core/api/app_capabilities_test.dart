// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/api/app_capabilities.dart';

void main() {
  test('fromJson 解析 preset/features/businessModules', () {
    final caps = AppCapabilities.fromJson({
      'preset': 'lite',
      'features': {'ai': true, 'search': false, 'todos': true},
      'businessModules': [
        {'id': 'events', 'label': '事件'},
        {'id': 'todos', 'label': '待办'},
      ],
    });

    expect(caps.preset, 'lite');
    expect(caps.isFeatureEnabled('search'), isFalse);
    expect(caps.isFeatureEnabled('ai'), isTrue);
    expect(caps.hasBusinessModule('events'), isTrue);
    expect(caps.hasBusinessModule('posts'), isFalse);
  });

  test('未知 feature key 默认视为开启，不误隐藏导航', () {
    final caps = AppCapabilities.fromJson({
      'preset': 'full',
      'features': {'search': false},
      'businessModules': [],
    });
    expect(caps.isFeatureEnabled('unknown_key'), isTrue);
  });

  test('preset 缺省时回退 full', () {
    final caps = AppCapabilities.fromJson({'features': {}});
    expect(caps.preset, 'full');
  });
}
