// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../data/models/notification_model.dart';
import '../providers/notifications_provider.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  @override
  void initState() {
    super.initState();
    // 延迟加载 + 订阅实时通知，避免 build 期间 notify
    Future.microtask(() {
      if (mounted) {
        final provider = context.read<NotificationsProvider>();
        provider.load();
        provider.subscribe();
      }
    });
  }

  /// 点击通知：标记已读 + 按 targetType 深链跳转。
  void _onTapNotification(BuildContext context, NotificationModel n) {
    final provider = context.read<NotificationsProvider>();
    provider.markRead(n.id);
    if (!mounted) return;
    switch (n.targetType) {
      case 'event':
        if (n.targetId != null) context.push('/events/${n.targetId}/edit');
        break;
      case 'conversation':
        context.push('/ai/history');
        break;
      case 'todo':
        context.go('/todos');
        break;
      case 'flow':
        context.go('/flows/tasks');
        break;
      default:
        break; // 无 target 或未知类型 → 仅标记已读
    }
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<NotificationsProvider>();
    final notifications = provider.notifications;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          previousPageTitle: l10n.back,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        middle: Text(l10n.notifications),
        trailing: notifications.isEmpty
            ? null
            : CupertinoButton(
                padding: EdgeInsets.zero,
                onPressed: () => context.read<NotificationsProvider>().markAllRead(),
                child: Text(l10n.markAllRead),
              ),
      ),
      child: notifications.isEmpty
          ? Center(
              child: Text(
                provider.loading ? l10n.loading : l10n.noNotifications,
                style: const TextStyle(color: CupertinoColors.systemGrey),
              ),
            )
          : ListView.separated(
              itemCount: notifications.length,
              separatorBuilder: (_, _) => Container(
                height: 0.5,
                color: CupertinoColors.separator.withAlpha(60),
              ),
              itemBuilder: (context, index) {
                final n = notifications[index];
                return Dismissible(
                  key: ValueKey(n.id),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    color: CupertinoColors.systemRed,
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    child: const Icon(CupertinoIcons.trash, color: CupertinoColors.white),
                  ),
                  onDismissed: (_) =>
                      context.read<NotificationsProvider>().delete(n.id),
                  child: GestureDetector(
                    onTap: () => _onTapNotification(context, n),
                    child: Container(
                      color: n.isRead
                          ? CupertinoColors.systemBackground
                          : CupertinoColors.systemGroupedBackground,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (!n.isRead)
                            Padding(
                              padding: const EdgeInsets.only(top: 6, right: 8),
                              child: Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: CupertinoColors.systemBlue,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  n.title,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: n.isRead
                                        ? FontWeight.w400
                                        : FontWeight.w600,
                                  ),
                                ),
                                if (n.body != null && n.body!.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    n.body!,
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: CupertinoColors.systemGrey,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _formatTime(n.createdAt),
                            style: const TextStyle(
                              fontSize: 12,
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
