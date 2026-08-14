import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/ai_chat_provider.dart';

/// AI 写操作确认卡片（内联展示，非弹窗）
///
/// 用户确认/拒绝后调用 provider.confirmPending，恢复被挂起的 SSE 流。
/// HS-6：支持「本会话信任此工具」免确认 + 关键参数预览。
class ChatConfirmationCard extends StatefulWidget {
  final PendingConfirmation confirmation;

  const ChatConfirmationCard({super.key, required this.confirmation});

  @override
  State<ChatConfirmationCard> createState() => _ChatConfirmationCardState();
}

class _ChatConfirmationCardState extends State<ChatConfirmationCard> {
  bool _trustTool = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isDark = CupertinoTheme.brightnessOf(context) == Brightness.dark;
    final provider = context.read<AiChatProvider>();
    final conf = widget.confirmation;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 340),
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
                conf.summary,
                style: TextStyle(
                  fontSize: 15,
                  color: CupertinoTheme.of(context).textTheme.textStyle.color,
                ),
              ),
              if (conf.arguments.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  l10n.aiConfirmArgsTitle,
                  style: TextStyle(
                    fontSize: 11,
                    color: CupertinoTheme.of(context).textTheme.textStyle.color
                        ?.withAlpha(160),
                  ),
                ),
                const SizedBox(height: 2),
                _ArgsPreview(arguments: conf.arguments),
              ],
              const SizedBox(height: 10),
              CupertinoButton(
                padding: EdgeInsets.zero,
                onPressed: () => setState(() => _trustTool = !_trustTool),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _trustTool
                          ? CupertinoIcons.checkmark_square_fill
                          : CupertinoIcons.square,
                      size: 18,
                      color: CupertinoTheme.of(context).primaryColor,
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        l10n.aiConfirmTrustTool,
                        style: TextStyle(
                          fontSize: 12,
                          color: CupertinoTheme.of(context)
                              .textTheme
                              .textStyle
                              .color
                              ?.withAlpha(200),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  CupertinoButton(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    onPressed: provider.isConfirming
                        ? null
                        : () => provider.confirmPending(
                              approved: false,
                              trustTool: _trustTool,
                            ),
                    child: Text(l10n.aiConfirmReject),
                  ),
                  const SizedBox(width: 8),
                  CupertinoButton.filled(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    onPressed: provider.isConfirming
                        ? null
                        : () => provider.confirmPending(
                              approved: true,
                              trustTool: _trustTool,
                            ),
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

/// 关键参数预览：展示 title/startTime/endTime/dueDate/location 等可读字段
class _ArgsPreview extends StatelessWidget {
  final Map<String, dynamic> arguments;
  const _ArgsPreview({required this.arguments});

  @override
  Widget build(BuildContext context) {
    final labels = <String, String>{
      'title': '标题',
      'startTime': '开始',
      'endTime': '结束',
      'dueDate': '截止',
      'location': '地点',
      'description': '描述',
      'reminderMinutes': '提醒',
    };
    final entries = arguments.entries
        .where((e) => e.value != null && e.value.toString().isNotEmpty)
        .where((e) => labels.containsKey(e.key))
        .toList();
    if (entries.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: entries.map((e) {
        return Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            '${labels[e.key]}: ${e.value}',
            style: TextStyle(
              fontSize: 12,
              color: CupertinoTheme.of(context).textTheme.textStyle.color,
            ),
          ),
        );
      }).toList(),
    );
  }
}
