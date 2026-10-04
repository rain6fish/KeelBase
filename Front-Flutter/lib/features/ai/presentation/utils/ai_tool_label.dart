// SPDX-License-Identifier: Apache-2.0

import 'dart:convert';
import '../../../../core/i18n/app_localizations.dart';

// The tool-name table used to live here, written in Chinese only, so an English reader saw Chinese.
// It has moved to [AppLocalizations] (`aiToolLabel` + `_toolLabels`) because it has to be bilingual
// and its keys have to be derived the same way the backend derives them — the parity gate compares
// that map against the backend metadata table. Read a label with `context.l10n.aiToolLabel(name)`.
//
// 工具名表原先写在这里、且只有中文，于是英文读者看到中文。它已移到 [AppLocalizations]
// （`aiToolLabel` + `_toolLabels`）：因为那张表必须是**双语的**，key 又必须与服务端同规则派生
// —— 对账闸就是拿它去比服务端元数据表。取值改用 `context.l10n.aiToolLabel(名字)`。

/// 工具参数 JSON → 业务摘要（提取关键参数；未覆盖返回空 = 不展示，技术参数进详情）。
///
/// 文案全部取自 [l10n] 的 `aiArgs*` 那组：本文件不持有任何中英文用户可见字面量。
/// Tool arguments JSON → a business summary; unlisted arguments return empty. All wording comes from
/// [l10n], so this file holds no user-visible literal in either language.
String aiToolArgsSummary(String? toolName, String? args, AppLocalizations l10n) {
  if (toolName == null || args == null || args.isEmpty) return '';
  Map<String, dynamic> a;
  try {
    a = jsonDecode(args) as Map<String, dynamic>;
  } catch (_) {
    return '';
  }
  switch (toolName) {
    case 'query_customers':
      final parts = <String>[];
      if (a['keyword'] != null) parts.add(l10n.aiArgsKeyword('${a['keyword']}'));
      if (a['riskLevel'] != null) parts.add(l10n.aiArgsRisk('${a['riskLevel']}'));
      if (a['status'] != null) parts.add(l10n.aiArgsStatus('${a['status']}'));
      return parts.isEmpty ? '' : l10n.aiArgsJoined(parts);
    case 'analyze_customer_risk':
    case 'query_customer_orders':
    case 'query_customer_activities':
    case 'summarize_customer_360':
      return a['customerId'] != null ? ' #${a['customerId']}' : '';
    case 'create_followup_task':
    case 'create_event':
    case 'create_todo':
    case 'create_project_task':
      return a['title'] != null ? l10n.aiArgsQuoted('${a['title']}') : '';
    case 'create_contract':
      return a['name'] != null ? l10n.aiArgsQuoted('${a['name']}') : '';
    default:
      return '';
  }
}
