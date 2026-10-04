// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/features/ai/presentation/utils/ai_tool_label.dart';

/// 工具名标签的双语行为（M5）。
///
/// 之前这张表只有中文、写死在 `ai_tool_label.dart` 里，于是**英文界面在轨迹页与工具卡上显示中文**。
/// 这里盯住的正是那条危害：英文取值里不允许出现汉字。
void main() {
  final zh = AppLocalizations(const Locale('zh', 'CN'));
  final en = AppLocalizations(const Locale('en'));

  final han = RegExp(r'[一-鿿]');

  group('aiToolLabel', () {
    test('两种语言各说各的（不再是中文单语）', () {
      expect(zh.aiToolLabel('create_followup_task'), '创建跟进任务');
      expect(en.aiToolLabel('create_followup_task'), 'Create follow-up task');
    });

    test('英文取值里不出现汉字 —— 这就是本项要消掉的那个危害', () {
      const toolNames = [
        'query_customers',
        'analyze_customer_risk',
        'create_followup_task',
        'query_projects',
        'review_approval_request',
        'query_events',
        'web_search',
      ];
      for (final name in toolNames) {
        expect(han.hasMatch(en.aiToolLabel(name)), isFalse, reason: 'en 的 $name 不该含汉字');
      }
    });

    test('未登记的工具名回退成原名（任何工具都可展示）', () {
      expect(zh.aiToolLabel('brand_new_tool'), 'brand_new_tool');
      expect(en.aiToolLabel('brand_new_tool'), 'brand_new_tool');
    });

    test('空名/无名给出「AI 操作」占位，且分语言', () {
      expect(zh.aiToolLabel(null), 'AI 操作');
      expect(zh.aiToolLabel(''), 'AI 操作');
      expect(en.aiToolLabel(null), 'AI action');
      expect(en.aiToolLabel(''), 'AI action');
    });

    test('key 派生与服务端同规则：下划线后是数字则不大写', () {
      // 后端 `toolLabelKey` 同样只大写 `_([a-z])`，故 360 保持原样。
      expect(AppLocalizations.toolLabelKey('summarize_customer_360'), 'ai.tool.summarizeCustomer_360');
      expect(zh.aiToolLabel('summarize_customer_360'), '客户摘要');
      expect(en.aiToolLabel('summarize_customer_360'), 'Summarize customer');
    });

    test('B 路径（外部系统）工具也有双语标签', () {
      expect(zh.aiToolLabel('list_customers'), '查询外部客户');
      expect(en.aiToolLabel('list_customers'), 'Query external customers');
    });
  });

  group('aiToolArgsSummary', () {
    test('中文用中文标点，英文用英文标点', () {
      final args = '{"keyword":"acme","status":"active"}';
      expect(aiToolArgsSummary('query_customers', args, zh), '（关键词「acme」 · 状态：active）');
      expect(aiToolArgsSummary('query_customers', args, en), ' (keyword "acme" · status: active)');
    });

    test('没有可提取的参数时返回空（不展示）', () {
      expect(aiToolArgsSummary('query_customers', '{}', zh), '');
      expect(aiToolArgsSummary('web_search', '{"q":"x"}', zh), '');
    });
  });
}
