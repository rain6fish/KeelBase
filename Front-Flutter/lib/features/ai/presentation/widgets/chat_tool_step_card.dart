import 'package:flutter/cupertino.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/ai_chat_provider.dart';

/// AI 工具执行步骤卡片（过程可视化）
///
/// 显示 agent 正在执行/已完成/失败的工具调用。
/// running → 转圈 + 「正在执行…」；success → 绿勾 + 「已完成」；error → 红叉 + 「执行失败」。
class ChatToolStepCard extends StatelessWidget {
  final ToolStepModel step;

  const ChatToolStepCard({super.key, required this.step});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isDark = CupertinoTheme.brightnessOf(context) == Brightness.dark;

    final Widget statusIcon = switch (step.status) {
      ToolStepStatus.running => const SizedBox(
          width: 18,
          height: 18,
          child: CupertinoActivityIndicator(radius: 7),
        ),
      ToolStepStatus.success => Icon(
          CupertinoIcons.checkmark_circle_fill,
          size: 18,
          color: CupertinoColors.systemGreen.resolveFrom(context),
        ),
      ToolStepStatus.error => Icon(
          CupertinoIcons.xmark_circle_fill,
          size: 18,
          color: CupertinoColors.systemRed.resolveFrom(context),
        ),
    };

    final String statusLabel = switch (step.status) {
      ToolStepStatus.running => l10n.aiToolRunning,
      ToolStepStatus.success => l10n.aiToolSuccess,
      ToolStepStatus.error => l10n.aiToolFailed,
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 320),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isDark
                ? CupertinoColors.systemGrey5.resolveFrom(context).withValues(alpha: 0.24)
                : CupertinoColors.systemGrey6.resolveFrom(context),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: statusIcon,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      step.summary,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 15,
                        color: CupertinoTheme.of(context).textTheme.textStyle.color,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      statusLabel,
                      style: TextStyle(
                        fontSize: 12,
                        color: CupertinoColors.systemGrey.resolveFrom(context),
                      ),
                    ),
                    if (step.status == ToolStepStatus.error && step.error != null &&
                        step.error!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        step.error!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: CupertinoColors.systemRed.resolveFrom(context),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
