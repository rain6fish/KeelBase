// SPDX-License-Identifier: Apache-2.0

import 'ai_tool_label.dart';

/// One human-readable line about a tool call, as the server sends it: a semantic key plus an
/// English fallback and the parameters to interpolate — not a finished sentence.
///
/// The server used to write the sentence in Chinese and every surface rendered it verbatim, so the
/// app showed Chinese to an English reader. Now the server says *what* to say and this side says it
/// in its own language: `ai.tool.*` keys resolve through [aiToolLabel] (the tool-name map already in
/// this feature), the `ai.present.*` ones through the table below, and anything without an entry
/// falls back to the server's English, interpolated.
///
/// 关于一次工具调用的一行人读文案：服务端发**语义 key + 英文兜底 + 参数**，而不是拼好的句子。
///
/// 服务端原先用中文拼句子、各面原样渲染，于是英文读者看到中文。现在服务端只说**说什么**，由本端
/// 用自己的语言说：`ai.tool.*` 走 [aiToolLabel]（本功能已有的工具名表），`ai.present.*` 走下面
/// 那张表，没有条目的回落到服务端的英文并插值。
class AiPresentationText {
  final String key;
  final String fallback;
  final Map<String, String> params;

  const AiPresentationText({
    required this.key,
    required this.fallback,
    this.params = const {},
  });

  /// 兼容服务端改写**之前**发出的普通字符串（在飞的流跨一次部署）：把它当作兜底文本。
  factory AiPresentationText.fromJson(Object? raw) {
    if (raw is String) {
      return AiPresentationText(key: '', fallback: raw);
    }
    if (raw is Map) {
      final params = <String, String>{};
      final rawParams = raw['params'];
      if (rawParams is Map) {
        rawParams.forEach((k, v) => params['$k'] = '$v');
      }
      return AiPresentationText(
        key: raw['key'] as String? ?? '',
        fallback: raw['fallback'] as String? ?? '',
        params: params,
      );
    }
    return const AiPresentationText(key: '', fallback: '');
  }

  bool get isEmpty => key.isEmpty && fallback.isEmpty;
}

/// `ai.present.*` 的中文模板（键与后端 `tool-presentation.service.ts` 发出的一致）。
/// `ai.present.result.failed` 有意不在此列 —— 它带的是工具自己的错误文本，不由客户端改写。
const Map<String, String> _zhPresentTemplates = {
  'ai.present.write.createEvent': '创建事件：{title}（{startTime} 至 {endTime}）',
  'ai.present.write.createTodo': '创建待办：{title}',
  'ai.present.write.createTodoDue': '创建待办：{title}（截止 {dueDate}）',
  'ai.present.write.createCustomers': '创建客户：{name}',
  'ai.present.write.createFollowupTask': '创建跟进任务：{title}',
  'ai.present.write.createContract': '创建合同：{name}',
  'ai.present.write.createProject': '创建项目：{title}',
  'ai.present.write.createProjectTask': '创建项目任务：{title}',
  'ai.present.write.updateCustomerStatus': '更新客户状态：{status}',
  'ai.present.write.submitApprovalRequest': '提交审批请求',
  'ai.present.write.createKnowledge': '创建知识条目',
  'ai.present.write.generic': '执行写操作',
  'ai.present.result.rows': '查询到 {count} 个结果',
  'ai.present.result.count': '共 {count} 个事件',
  'ai.present.result.getUserStats': '获取用户统计完成',
  'ai.present.result.navigate': '跳转至{description}',
  'ai.present.result.createEvent': '创建事件成功',
  'ai.present.result.createTodo': '创建待办成功',
  'ai.present.result.done': '执行完成',
  'ai.present.result.timeout': '操作超时未确认',
  'ai.present.result.cancelled': '操作已取消',
  'ai.present.result.denied': '工具被拒绝',
  'ai.present.result.error': '工具执行失败',
  'ai.present.runBatch': '一次授权整批（{count} 个动作）',
};

String _interpolate(String template, Map<String, String> params) {
  if (params.isEmpty) return template;
  return template.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) {
    final key = m.group(1)!;
    return params.containsKey(key) ? params[key]! : m.group(0)!;
  });
}

/// 渲染一条 [AiPresentationText]。`toolName` 供 `ai.tool.*` 那类 key 走已有的工具名表；
/// 没有对应条目时插值服务端的英文兜底（不显示空、也不显示 key）。
String presentAiText(
  AiPresentationText? text, {
  String? toolName,
  required bool isZh,
}) {
  if (text == null || text.isEmpty) {
    if (toolName == null || toolName.isEmpty) return '';
    return isZh ? aiToolLabel(toolName) : toolName;
  }
  var template = text.fallback;
  if (isZh) {
    if (text.key.startsWith('ai.tool.')) {
      if (toolName != null && toolName.isNotEmpty) template = aiToolLabel(toolName);
    } else {
      template = _zhPresentTemplates[text.key] ?? text.fallback;
    }
  }
  return _interpolate(template, text.params);
}
