import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/ai_chat_provider.dart';

/// AI 写操作确认卡片（内联展示，非弹窗）
///
/// 用户确认/拒绝后调用 provider.confirmPending，恢复被挂起的 SSE 流。
class ChatConfirmationCard extends StatelessWidget {
  final PendingConfirmation confirmation;

  const ChatConfirmationCard({super.key, required this.confirmation});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isDark = CupertinoTheme.brightnessOf(context) == Brightness.dark;
    final provider = context.read<AiChatProvider>();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 320),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isDark
                ? CupertinoColors.systemGrey5.resolveFrom(context).withAlpha(60)
                : CupertinoColors.systemGrey6.resolveFrom(context),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: CupertinoTheme.of(context).primaryColor.withAlpha(90),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l10n.aiConfirmTitle,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: CupertinoTheme.of(context).primaryColor,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                confirmation.summary,
                style: TextStyle(
                  fontSize: 15,
                  color: CupertinoTheme.of(context).textTheme.textStyle.color,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  CupertinoButton(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    onPressed: provider.isConfirming
                        ? null
                        : () => provider.confirmPending(approved: false),
                    child: Text(l10n.aiConfirmReject),
                  ),
                  const SizedBox(width: 8),
                  CupertinoButton.filled(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    onPressed: provider.isConfirming
                        ? null
                        : () => provider.confirmPending(approved: true),
                    child: provider.isConfirming
                        ? Text(l10n.aiConfirming)
                        : Text(l10n.aiConfirmApprove),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
