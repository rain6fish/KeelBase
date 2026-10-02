// SPDX-License-Identifier: Apache-2.0

import '../../presentation/utils/ai_presentation_text.dart';

/// 工具步骤卡状态
enum ToolStepStatus { running, success, error }

/// 工具执行步骤（来自 SSE tool_start / tool_end 事件，前端过程可视化）
/// ADT（P0-14）：isWrite 标记写操作（需确认、可撤销），卡片据此展示读/写与确认态。
class ToolStepModel {
  final String name;
  final ToolStepStatus status;
  final AiPresentationText? summary;
  final String? error;
  final bool isWrite;

  const ToolStepModel({
    required this.name,
    required this.status,
    this.summary,
    this.error,
    this.isWrite = false,
  });

  ToolStepModel copyWith({
    ToolStepStatus? status,
    AiPresentationText? summary,
    String? error,
    bool? isWrite,
  }) {
    return ToolStepModel(
      name: name,
      status: status ?? this.status,
      summary: summary ?? this.summary,
      error: error ?? this.error,
      isWrite: isWrite ?? this.isWrite,
    );
  }
}
