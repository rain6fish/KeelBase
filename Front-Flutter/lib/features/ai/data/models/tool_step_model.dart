/// 工具步骤卡状态
enum ToolStepStatus { running, success, error }

/// 工具执行步骤（来自 SSE tool_start / tool_end 事件，前端过程可视化）
class ToolStepModel {
  final String name;
  final ToolStepStatus status;
  final String summary;
  final String? error;

  const ToolStepModel({
    required this.name,
    required this.status,
    required this.summary,
    this.error,
  });

  ToolStepModel copyWith({
    ToolStepStatus? status,
    String? summary,
    String? error,
  }) {
    return ToolStepModel(
      name: name,
      status: status ?? this.status,
      summary: summary ?? this.summary,
      error: error ?? this.error,
    );
  }
}
