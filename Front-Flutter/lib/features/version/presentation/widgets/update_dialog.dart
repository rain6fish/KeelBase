import 'package:flutter/cupertino.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../data/models/app_version_info.dart';

/// 打开更新链接（App Store / 应用市场 / 下载页）。
Future<void> launchUpdateUrl(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

/// 强制更新弹窗：不可关闭，仅「前往更新」。
Future<void> showForceUpdateDialog(
  BuildContext context,
  AppVersionInfo info,
) {
  return showCupertinoDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) {
      final l10n = AppLocalizations.of(ctx);
      return CupertinoAlertDialog(
        title: Text(l10n.forceUpdateTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.forceUpdateMessage),
            if (info.changelog.isNotEmpty) ...[
              const SizedBox(height: 12),
              ...info.changelog
                  .map((line) => Text('• $line', style: const TextStyle(fontSize: 13))),
            ],
          ],
        ),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => launchUpdateUrl(info.updateUrl),
            child: Text(l10n.updateNow),
          ),
        ],
      );
    },
  );
}

/// 引导更新弹窗：可关闭（稍后再说）。
Future<void> showOptionalUpdateDialog(
  BuildContext context,
  AppVersionInfo info,
) {
  return showCupertinoDialog<void>(
    context: context,
    builder: (ctx) {
      final l10n = AppLocalizations.of(ctx);
      return CupertinoAlertDialog(
        title: Text(l10n.updateAvailable),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.newVersionAvailable),
            if (info.changelog.isNotEmpty) ...[
              const SizedBox(height: 12),
              ...info.changelog
                  .map((line) => Text('• $line', style: const TextStyle(fontSize: 13))),
            ],
          ],
        ),
        actions: [
          CupertinoDialogAction(
            child: Text(l10n.later),
            onPressed: () => Navigator.pop(ctx),
          ),
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => launchUpdateUrl(info.updateUrl),
            child: Text(l10n.updateNow),
          ),
        ],
      );
    },
  );
}
