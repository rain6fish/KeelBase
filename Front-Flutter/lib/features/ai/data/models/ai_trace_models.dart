// P0-14 Agent Decision Trace：单条对话的执行轨迹（工具调用/确认/副作用/结果）。
// 对应后端 GET /ai/conversations/:id/trace 返回结构。

class AiTraceEffect {
  final int effectId;
  final String resultType;
  final int resultId;
  final String? targetTitle;
  final bool revocable;

  const AiTraceEffect({
    required this.effectId,
    required this.resultType,
    required this.resultId,
    this.targetTitle,
    required this.revocable,
  });

  factory AiTraceEffect.fromJson(Map<String, dynamic> json) {
    return AiTraceEffect(
      effectId: json['effectId'] as int? ?? 0,
      resultType: json['resultType'] as String? ?? '',
      resultId: json['resultId'] as int? ?? 0,
      targetTitle: json['targetTitle'] as String?,
      revocable: json['revocable'] as bool? ?? false,
    );
  }
}

class AiTraceStep {
  final String id;
  final String type; // input | assistant | tool_call | confirmation | effect | notice
  final String time;
  final String? toolName;
  final String? args;
  final bool? success;
  final String? errorMessage;
  final String? outcome; // approve | decline | timeout
  final bool? trusted;
  final String? content;
  final String? detail;
  final String? model;
  final String? provider;
  final int? tokens;
  final AiTraceEffect? effect;

  const AiTraceStep({
    required this.id,
    required this.type,
    required this.time,
    this.toolName,
    this.args,
    this.success,
    this.errorMessage,
    this.outcome,
    this.trusted,
    this.content,
    this.detail,
    this.model,
    this.provider,
    this.tokens,
    this.effect,
  });

  bool get isToolCall => type == 'tool_call';
  bool get isConfirmation => type == 'confirmation';
  bool get isEffect => type == 'effect';
  bool get isInput => type == 'input';
  bool get isAssistant => type == 'assistant';

  factory AiTraceStep.fromJson(Map<String, dynamic> json) {
    return AiTraceStep(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? 'notice',
      time: json['time'] as String? ?? '',
      toolName: json['toolName'] as String?,
      args: json['args'] as String?,
      success: json['success'] as bool?,
      errorMessage: json['errorMessage'] as String?,
      outcome: json['outcome'] as String?,
      trusted: json['trusted'] as bool?,
      content: json['content'] as String?,
      detail: json['detail'] as String?,
      model: json['model'] as String?,
      provider: json['provider'] as String?,
      tokens: json['tokens'] as int?,
      effect: json['effect'] is Map<String, dynamic>
          ? AiTraceEffect.fromJson(json['effect'] as Map<String, dynamic>)
          : null,
    );
  }
}

class AiTrace {
  final String id;
  final String? provider;
  final String? model;
  final List<AiTraceStep> steps;

  const AiTrace({
    required this.id,
    this.provider,
    this.model,
    this.steps = const [],
  });

  factory AiTrace.fromJson(Map<String, dynamic> json) {
    final conversation = json['conversation'] as Map<String, dynamic>? ?? const {};
    final rawSteps = json['steps'] as List? ?? const [];
    return AiTrace(
      id: conversation['id'] as String? ?? '',
      provider: conversation['provider'] as String?,
      model: conversation['model'] as String?,
      steps: rawSteps
          .whereType<Map<String, dynamic>>()
          .map(AiTraceStep.fromJson)
          .toList(),
    );
  }
}
