import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/ai_chat_provider.dart';
import '../providers/conversation_provider.dart';

class AiConversationHistoryPage extends StatefulWidget {
  const AiConversationHistoryPage({super.key});

  @override
  State<AiConversationHistoryPage> createState() => _AiConversationHistoryPageState();
}

class _AiConversationHistoryPageState extends State<AiConversationHistoryPage> {
  @override
  void initState() {
    super.initState();
    // 延迟加载，避免 build 期间 notify
    Future.microtask(() {
      if (mounted) context.read<ConversationProvider>().load();
    });
  }

  String _formatTime(String? iso) {
    if (iso == null) return '';
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return '';
    final now = DateTime.now();
    if (d.year == now.year && d.month == now.month && d.day == now.day) {
      return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    }
    return '${d.month}/${d.day}';
  }

  Future<void> _openConversation(String id) async {
    final chatProvider = context.read<AiChatProvider>();
    await chatProvider.loadConversation(id);
    if (!mounted) return;
    if (chatProvider.error == null) {
      Navigator.of(context).pop();
    } else {
      AppToast.error(context, context.l10n.aiLoadFailed);
    }
  }

  /// 删除确认弹窗（trash 按钮与滑动删除共用）。
  Future<bool> _confirmDelete(String id, String title) async {
    final l10n = context.l10n;
    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(l10n.delete),
        content: Text(l10n.deleteConversationConfirm(title)),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.delete),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }

  /// 删除对话并等待结果；失败（服务端删除未成功、本地已回滚）时提示用户。
  Future<void> _handleDelete(String id) async {
    final provider = context.read<ConversationProvider>();
    await provider.delete(id);
    if (!mounted) return;
    if (provider.conversations.any((c) => c.id == id)) {
      AppToast.error(context, context.l10n.deleteFailed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<ConversationProvider>();
    final conversations = provider.conversations;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          previousPageTitle: l10n.back,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        middle: Text(l10n.conversationHistory),
      ),
      child: conversations.isEmpty
          ? _buildEmptyState(provider, l10n)
          : ListView.separated(
              itemCount: conversations.length,
              separatorBuilder: (_, _) => Container(
                height: 0.5,
                color: CupertinoColors.separator.withValues(alpha: 0.24),
              ),
              itemBuilder: (context, index) {
                final c = conversations[index];
                return Dismissible(
                  key: ValueKey(c.id),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    color: CupertinoColors.systemRed,
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    child: const Icon(CupertinoIcons.trash, color: CupertinoColors.white),
                  ),
                  // 滑动删除与 trash 按钮一致，都先确认再删
                  confirmDismiss: (_) => _confirmDelete(c.id, c.previewTitle),
                  onDismissed: (_) => _handleDelete(c.id),
                  child: GestureDetector(
                    onTap: () => _openConversation(c.id),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  c.previewTitle,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w500,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _formatTime(c.lastActivityAt ?? c.createdAt),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: CupertinoColors.systemGrey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          CupertinoButton(
                            padding: EdgeInsets.zero,
                            onPressed: () async {
                              final confirmed = await _confirmDelete(c.id, c.previewTitle);
                              if (confirmed && mounted) {
                                await _handleDelete(c.id);
                              }
                            },
                            child: const Icon(
                              CupertinoIcons.trash,
                              size: 18,
                              color: CupertinoColors.systemGrey,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }

  /// 空列表/加载中/加载失败三态。
  Widget _buildEmptyState(ConversationProvider provider, AppLocalizations l10n) {
    if (provider.loading) {
      return Center(
        child: Text(
          l10n.loading,
          style: const TextStyle(color: CupertinoColors.systemGrey),
        ),
      );
    }
    if (provider.error != null) {
      return AppErrorView(
        message: provider.error!,
        onRetry: () => provider.load(),
      );
    }
    return Center(
      child: Text(
        l10n.noConversationHistory,
        style: const TextStyle(color: CupertinoColors.systemGrey),
      ),
    );
  }
}
