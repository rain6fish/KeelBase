// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/session_provider.dart';

/// 登录设备列表页：查看已登录设备 + 远程登出
class SessionListPage extends StatefulWidget {
  const SessionListPage({super.key});

  @override
  State<SessionListPage> createState() => _SessionListPageState();
}

class _SessionListPageState extends State<SessionListPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) {
        context.read<SessionProvider>().load();
      }
    });
  }

  Future<void> _confirmRevoke(int id) async {
    final l10n = context.l10n;
    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(l10n.revokeSessionConfirmTitle),
        content: Text(l10n.revokeSessionConfirmBody),
        actions: [
          CupertinoDialogAction(
            child: Text(l10n.cancel),
            onPressed: () => Navigator.pop(ctx, false),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            child: Text(l10n.revoke),
            onPressed: () => Navigator.pop(ctx, true),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!mounted) return;

    final ok = await context.read<SessionProvider>().revoke(id);
    if (!mounted) return;
    AppToast.show(
      context,
      ok ? l10n.revokeSuccess : (context.read<SessionProvider>().error ?? l10n.unknownError),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<SessionProvider>();

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.sessionManagement),
        previousPageTitle: l10n.back,
      ),
      child: provider.loading && provider.sessions.isEmpty
          ? const Center(child: CupertinoActivityIndicator())
          : provider.sessions.isEmpty
              ? Center(child: Text(l10n.noSessions, style: const TextStyle(fontSize: 16)))
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: provider.sessions.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 0),
                  itemBuilder: (context, i) {
                    final s = provider.sessions[i];
                    return _buildRow(context, s, provider);
                  },
                ),
    );
  }

  Widget _buildRow(BuildContext context, s, SessionProvider provider) {
    final l10n = context.l10n;
    final t = CupertinoTheme.of(context);
    final name = s.deviceName ?? s.deviceId ?? '#${s.id}';
    final time = _formatTime(s.lastActiveAt ?? s.createdAt);

    return Container(
      decoration: BoxDecoration(
        color: CupertinoColors.secondarySystemBackground.resolveFrom(context),
        border: Border(
          bottom: BorderSide(
            color: CupertinoColors.systemGrey.withAlpha(30),
            width: 0.5,
          ),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Icon(
            CupertinoIcons.device_phone_portrait,
            color: s.isCurrent ? t.primaryColor : CupertinoColors.systemGrey,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(name,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                          overflow: TextOverflow.ellipsis),
                    ),
                    if (s.isCurrent) ...[
                      const SizedBox(width: 6),
                      Text(
                        l10n.currentDevice,
                        style: TextStyle(fontSize: 12, color: t.primaryColor),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  time,
                  style: TextStyle(fontSize: 13, color: CupertinoColors.systemGrey.resolveFrom(context)),
                ),
              ],
            ),
          ),
          if (!s.isCurrent)
            CupertinoButton(
              padding: const EdgeInsets.only(left: 12),
              minimumSize: const Size(32, 32),
              onPressed: provider.revokingId == s.id
                  ? null
                  : () => _confirmRevoke(s.id),
              child: Icon(
                CupertinoIcons.power,
                size: 20,
                color: provider.revokingId == s.id
                    ? CupertinoColors.systemGrey
                    : CupertinoColors.destructiveRed,
              ),
            ),
        ],
      ),
    );
  }

  String _formatTime(String? iso) {
    if (iso == null) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return '刚刚';
    if (diff.inHours < 1) return '${diff.inMinutes} 分钟前';
    if (diff.inDays < 1) return '${diff.inHours} 小时前';
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }
}
