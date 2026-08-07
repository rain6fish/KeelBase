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
      id: json['id'] as String,
      provider: json['provider'] as String?,
      model: json['model'] as String?,
      messages: rawMessages
          .map((m) => ConversationMessagePreview.fromJson(m as Map<String, dynamic>))
          .toList(),
      createdAt: json['createdAt'] as String?,
      lastActivityAt: json['lastActivityAt'] as String?,
    );
  }

  /// 首条 user 消息内容（用作列表标题预览）
  String get previewTitle {
    String text = '新对话';
    for (final m in messages) {
      if (m.role == 'user') {
        text = m.content.trim();
        break;
      }
    }
    return text.length > 30 ? '${text.substring(0, 30)}...' : text;
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
