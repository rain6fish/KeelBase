// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/i18n/app_localizations.dart';

/// 两处显示名此前写死在**没有 BuildContext** 的层里（模型名在 provider、兜底标题在模型），
/// 于是英文读者看到中文。它们现在由本地化类给，这个文件盯住「两种语言各说各的」。
void main() {
  final zh = AppLocalizations(const Locale('zh', 'CN'));
  final en = AppLocalizations(const Locale('en'));

  group('aiProviderName', () {
    test('中文品牌名译，英文名照原样', () {
      expect(zh.aiProviderName('qwen'), '通义千问');
      expect(en.aiProviderName('qwen'), 'Qwen');
      expect(zh.aiProviderName('deepseek'), 'DeepSeek');
      expect(en.aiProviderName('deepseek'), 'DeepSeek');
    });

    test('未知 id 原样返回 —— 不凭空造名字', () {
      expect(zh.aiProviderName('some-new-provider'), 'some-new-provider');
      expect(en.aiProviderName('some-new-provider'), 'some-new-provider');
    });

    test('英文取值里不出现汉字', () {
      for (final id in ['qwen', 'deepseek']) {
        expect(RegExp(r'[一-鿿]').hasMatch(en.aiProviderName(id)), isFalse);
      }
    });
  });

  group('newConversation', () {
    test('兜底标题分语言', () {
      expect(zh.newConversation, '新对话');
      expect(en.newConversation, 'New conversation');
    });
  });
}
