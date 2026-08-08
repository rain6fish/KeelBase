import 'package:flutter/cupertino.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/app_constants.dart';
import '../i18n/app_localizations.dart';

/// UX-2 开发调试菜单（长按 Dashboard 头像弹出）。
/// 提供：环境切换（写 dev_base_url，重启生效）、清除数据、当前环境信息。
Future<void> showDevMenuSheet(BuildContext context) {
  return showCupertinoModalPopup<void>(
    context: context,
    builder: (ctx) => const DevMenuSheet(),
  );
}

class DevMenuSheet extends StatefulWidget {
  const DevMenuSheet({super.key});

  @override
  State<DevMenuSheet> createState() => _DevMenuSheetState();
}

class _DevMenuSheetState extends State<DevMenuSheet> {
  int _selected = 0;
  bool _switching = false;

  @override
  void initState() {
    super.initState();
    final current = AppConstants.activeBaseUrl;
    final idx = AppConstants.devEnvironments.indexWhere((e) => e.url == current);
    _selected = idx >= 0 ? idx : AppConstants.devEnvironments.length;
  }

  Future<void> _switchEnvironment(int index) async {
    final url = AppConstants.devEnvironments[index].url;
    if (url == AppConstants.activeBaseUrl) {
      setState(() => _selected = index);
      return;
    }
    setState(() {
      _selected = index;
      _switching = true;
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.keyDevBaseUrl, url);
    if (!mounted) return;
    setState(() => _switching = false);
    Navigator.of(context).pop();
    showCupertinoDialog<void>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(context.l10n.devEnvSwitched),
        content: Text('$url\n${context.l10n.devEnvRestart}'),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(context.l10n.announcementDismiss),
          ),
        ],
      ),
    );
  }

  Future<void> _clearAllData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (!mounted) return;
    Navigator.of(context).pop();
    showCupertinoDialog<void>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(context.l10n.devDataCleared),
        content: Text(context.l10n.devEnvRestart),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(context.l10n.announcementDismiss),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.devMenuTitle,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(
              '${l10n.devCurrentEnv}: ${AppConstants.activeBaseUrl}',
              style: TextStyle(fontSize: 12, color: CupertinoColors.systemGrey.resolveFrom(context)),
            ),
            const SizedBox(height: 16),
            Text(l10n.devEnvironment,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: CupertinoColors.systemGrey.resolveFrom(context))),
            const SizedBox(height: 8),
            _buildEnvOptions(l10n),
            const SizedBox(height: 20),
            CupertinoButton(
              color: CupertinoColors.systemRed,
              borderRadius: BorderRadius.circular(10),
              onPressed: _switching ? null : _clearAllData,
              child: Text(l10n.devClearData,
                  style: const TextStyle(color: CupertinoColors.white)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEnvOptions(AppLocalizations l10n) {
    return Column(
      children: [
        for (var i = 0; i < AppConstants.devEnvironments.length; i++)
          GestureDetector(
            onTap: _switching ? null : () => _switchEnvironment(i),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: i == _selected
                    ? CupertinoTheme.of(context).primaryColor.withAlpha(20)
                    : null,
              ),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(AppConstants.devEnvironments[i].label,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    Text(AppConstants.devEnvironments[i].url,
                        style: const TextStyle(fontSize: 12)),
                  ]),
                ),
                if (i == _selected)
                  Icon(CupertinoIcons.checkmark_circle_fill,
                      color: CupertinoTheme.of(context).primaryColor),
              ]),
            ),
          ),
      ],
    );
  }
}
