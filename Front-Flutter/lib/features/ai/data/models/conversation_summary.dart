// SPDX-License-Identifier: Apache-2.0

/// 对话历史摘要（列表页用）。后端 GET /ai/conversations 返回的每条。
class ConversationSummary {
  final String id;
  final String? provider;
  final String? model;
  final List<ConversationMessagePreview> messages;
  final String? createdAt;
  final String? lastActivityAt;

  const ConversationSummary({
    required this.id,
    this.provider,
    this.model,
    this.messages = const [],
    this.createdAt,
    this.lastActivityAt,
  });

  factory ConversationSummary.fromJson(Map<String, dynamic> json) {
    final rawMessages = json['messages'] as List? ?? [];
    return ConversationSummary(
      // 防御性解析：单条畸形数据不拖垮整个列表
      id: json['id'] as String? ?? '',
      provider: json['provider'] as String?,
      model: json['model'] as String?,
      messages: rawMessages
          .whereType<Map<String, dynamic>>()
          .map(ConversationMessagePreview.fromJson)
          .toList(),
      createdAt: json['createdAt'] as String?,
      lastActivityAt: json['lastActivityAt'] as String?,
    );
  }

  /// 首条非空 user 消息（截断到 30 字）；没有则 `null`。
  ///
  /// 截断留在这里 —— 它是**标题预览的数据形状**，不是措辞。但「没有消息时显示什么」是措辞，
  /// 而这一层没有 BuildContext、说不了两种语言：兜底由 UI 给（`l10n.newConversation`）。
  ///
  /// The first non-empty user message, truncated to 30 characters, or null. Truncation belongs here
  /// (it is the shape of a title preview); the fallback wording does not — this layer has no build
  /// context, so the UI supplies `l10n.newConversation`.
  String? get titlePreview {
    for (final m in messages) {
      if (m.role == 'user') {
        final trimmed = m.content.trim();
        // 跳过空白首条，避免标题退化为空字符串
        if (trimmed.isNotEmpty) {
          return trimmed.length > 30 ? '${trimmed.substring(0, 30)}...' : trimmed;
        }
      }
    }
    return null;
  }
}

class ConversationMessagePreview {
  final String role;
  final String content;
  final String? timestamp;

  const ConversationMessagePreview({
    required this.role,
    required this.content,
    this.timestamp,
  });

  factory ConversationMessagePreview.fromJson(Map<String, dynamic> json) {
    return ConversationMessagePreview(
      role: json['role'] as String? ?? 'user',
      content: json['content'] as String? ?? '',
      timestamp: json['timestamp'] as String?,
    );
  }
}
