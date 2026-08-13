import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/services/app_lock_provider.dart';
import '../../../../core/services/locale_provider.dart';
import '../../../../core/services/theme_provider.dart';
import '../../../../core/widgets/app_list_section.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../../version/presentation/providers/version_check_provider.dart';
import '../../../version/presentation/widgets/update_dialog.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final themeProvider = context.watch<ThemeProvider>();
    final localeProvider = context.watch<LocaleProvider>();
    final appLockProvider = context.watch<AppLockProvider>();

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.settings),
        // Use explicit GoRouter navigation for reliable back behavior
        leading: CupertinoNavigationBarBackButton(
          onPressed: () {
            final router = GoRouter.of(context);
            if (router.canPop()) {
              router.pop();
            } else {
              router.go('/profile');
            }
          },
        ),
      ),
      child: ListView(
        padding: const EdgeInsets.only(top: 20),
        children: [
          // Appearance section
          AppListSection(
            header: Text(l10n.sectionAppearance),
            children: [
              CupertinoListTile(
                title: Text(l10n.themeMode),
                trailing: CupertinoSlidingSegmentedControl<AppThemeMode>(
                  groupValue: themeProvider.themeMode,
                  children: const {
                    AppThemeMode.light: Text('☀️', style: TextStyle(fontSize: 18)),
                    AppThemeMode.dark: Text('🌙', style: TextStyle(fontSize: 18)),
                    AppThemeMode.system: Text('🖥', style: TextStyle(fontSize: 18)),
                  },
                  onValueChanged: (mode) {
                    if (mode != null) themeProvider.setThemeMode(mode);
                  },
                ),
              ),
            ],
          ),

          // Language
          AppListSection(
            header: Text(l10n.sectionRegion),
            children: [
              CupertinoListTile(
                title: Text(l10n.language),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      localeProvider.displayName,
                      style: TextStyle(
                        color: CupertinoColors.systemGrey.resolveFrom(context),
                        fontSize: 15,
                      ),
                    ),
                    const CupertinoListTileChevron(),
                  ],
                ),
                onTap: () => _showLanguagePicker(context, localeProvider),
              ),
            ],
          ),

          // Sessions + App Lock
          AppListSection(
            header: Text(l10n.sectionAccount),
            children: [
              CupertinoListTile(
                title: Text(l10n.sessionManagement),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.push('/sessions'),
              ),
              CupertinoListTile(
                title: Text(l10n.appLock),
                subtitle: Text(l10n.appLockSubtitle),
                trailing: CupertinoSwitch(
                  value: appLockProvider.enabled,
                  onChanged: (v) => _toggleAppLock(context, v),
                ),
              ),
            ],
          ),

          // About
          AppListSection(
            header: Text(l10n.sectionAbout),
            children: [
              CupertinoListTile(
                title: Text(l10n.feedbackTitle),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.push('/feedback'),
              ),
              CupertinoListTile(
                title: Text(l10n.version),
                trailing: Text(
                  AppConstants.appVersion,
                  style: TextStyle(
                    color: CupertinoColors.systemGrey.resolveFrom(context),
                    fontSize: 15,
                  ),
                ),
                onTap: () => _checkForUpdate(context),
              ),
            ],
          ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  static Future<void> _toggleAppLock(BuildContext context, bool value) async {
    final provider = context.read<AppLockProvider>();
    final ok = await provider.setEnabled(value);
    if (!context.mounted) return;
    final l10n = AppLocalizations.of(context);
    if (!ok) {
      AppToast.error(context, l10n.appLockUnsupported);
    } else if (!value) {
      AppToast.show(context, l10n.appLockDisabled);
    }
  }

  static Future<void> _checkForUpdate(BuildContext context) async {
    final provider = context.read<VersionCheckProvider>();
    final decision = await provider.check();
    if (!context.mounted) return;
    final info = provider.info;
    if (decision == AppUpdateDecision.forced && info != null) {
      await showForceUpdateDialog(context, info);
    } else if (decision == AppUpdateDecision.optional && info != null) {
      await showOptionalUpdateDialog(context, info);
    } else {
      AppToast.show(context, AppLocalizations.of(context).upToDate);
    }
  }

  void _showLanguagePicker(BuildContext context, LocaleProvider provider) {
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: Text(AppLocalizations.of(context).language),
        actions: [
          CupertinoActionSheetAction(
            isDefaultAction: provider.locale.languageCode == 'en',
            onPressed: () {
              Navigator.pop(ctx);
              provider.setLocale(const Locale('en', 'US'));
            },
            child: const Text('English'),
          ),
          CupertinoActionSheetAction(
            isDefaultAction: provider.locale.languageCode == 'zh',
            onPressed: () {
              Navigator.pop(ctx);
              provider.setLocale(const Locale('zh', 'CN'));
            },
            child: const Text('中文'),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDestructiveAction: false,
          onPressed: () => Navigator.pop(ctx),
          child: Text(
            AppLocalizations.of(context).cancel,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 17),
          ),
        ),
      ),
    );
  }
}
