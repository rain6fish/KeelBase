import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
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
    if (mounted) Navigator.of(context).pop();
  }

  void _confirmDelete(String id, String title) {
    showCupertinoDialog<void>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('删除对话'),
        content: Text('确定删除「$title」？'),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('取消'),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () {
              Navigator.of(ctx).pop();
              context.read<ConversationProvider>().delete(id);
            },
            child: const Text('删除'),
          ),
        ],
      ),
    );
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
        middle: const Text('对话历史'),
      ),
      child: conversations.isEmpty
          ? Center(
              child: Text(
                provider.loading ? l10n.loading : '暂无历史对话',
                style: const TextStyle(color: CupertinoColors.systemGrey),
              ),
            )
          : ListView.separated(
              itemCount: conversations.length,
              separatorBuilder: (_, _) => Container(
                height: 0.5,
                color: CupertinoColors.separator.withAlpha(60),
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
                  onDismissed: (_) =>
                      context.read<ConversationProvider>().delete(c.id),
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
                            onPressed: () => _confirmDelete(c.id, c.previewTitle),
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
}
