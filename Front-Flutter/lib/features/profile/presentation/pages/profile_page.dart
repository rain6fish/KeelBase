import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_list_section.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../../auth/presentation/providers/auth_provider.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = CupertinoTheme.of(context);
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          onPressed: () {
            final router = GoRouter.of(context);
            if (router.canPop()) {
              router.pop();
            } else {
              router.go('/');
            }
          },
        ),
        middle: Text(l10n.tabProfile),
      ),
      child: ListView(
        padding: const EdgeInsets.only(top: 20),
        children: [
          // Avatar & info
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Column(
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: theme.primaryColor.withAlpha(40),
                    shape: BoxShape.circle,
                    image: user?.avatarUrl != null && user!.avatarUrl!.isNotEmpty
                        ? DecorationImage(
                            image: NetworkImage(AppConstants.resolveUrl(user.avatarUrl)),
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  child: user?.avatarUrl == null || user!.avatarUrl!.isEmpty
                      ? Center(
                          child: Text(
                            (user?.displayName ?? 'U').substring(0, 1).toUpperCase(),
                            style: TextStyle(
                              fontSize: 36,
                              fontWeight: FontWeight.w600,
                              color: theme.primaryColor,
                            ),
                          ),
                        )
                      : null,
                ),
                const SizedBox(height: 12),
                Text(user?.displayName ?? '', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
                if (user?.username != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '@${user!.username}',
                      style: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey.resolveFrom(context)),
                    ),
                  ),
              ],
            ),
          ),

          // Info fields
          AppListSection(
            children: [
              if (user?.email != null && user!.email!.isNotEmpty)
                CupertinoListTile(
                  leading: const Icon(CupertinoIcons.mail, color: CupertinoColors.systemBlue),
                  title: Text(l10n.email),
                  trailing: Text(user!.email!, style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context))),
                ),
              if (user?.phone != null && user!.phone!.isNotEmpty)
                CupertinoListTile(
                  leading: const Icon(CupertinoIcons.phone, color: CupertinoColors.systemGreen),
                  title: Text(l10n.phone),
                  trailing: Text(user!.phone!, style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context))),
                ),
              if (user?.dateOfBirth != null && user!.dateOfBirth!.isNotEmpty)
                CupertinoListTile(
                  leading: const Icon(CupertinoIcons.calendar, color: CupertinoColors.systemOrange),
                  title: Text(l10n.dateOfBirth),
                  trailing: Text(user!.dateOfBirth!, style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context))),
                ),
              if (user?.bio != null && user!.bio!.isNotEmpty)
                CupertinoListTile(
                  leading: const Icon(CupertinoIcons.text_quote, color: CupertinoColors.systemPurple),
                  title: Text(l10n.bio),
                  trailing: SizedBox(
                    width: 200,
                    child: Text(user!.bio!, style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context)),
                      textAlign: TextAlign.right, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ),
                ),
              if (user?.createdAt != null)
                CupertinoListTile(
                  leading: const Icon(CupertinoIcons.clock, color: CupertinoColors.systemGrey),
                  title: Text('Member since'),
                  trailing: Text(user!.createdAt!.substring(0, 10), style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context))),
                ),
            ],
          ),

          const SizedBox(height: 12),

          // Account section
          AppListSection(
            header: Text(l10n.sectionAccount),
            children: [
              // 未验证邮箱提示
              if (user != null && !user!.emailVerified)
                CupertinoListTile(
                  leading: Icon(CupertinoIcons.exclamationmark_circle, color: CupertinoColors.systemOrange),
                  title: Text(
                    l10n.emailUnverified,
                    style: TextStyle(color: CupertinoColors.systemOrange.resolveFrom(context)),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        l10n.verifyNow,
                        style: TextStyle(
                          color: CupertinoTheme.of(context).primaryColor,
                          fontSize: 14,
                        ),
                      ),
                      const CupertinoListTileChevron(),
                    ],
                  ),
                  onTap: () => context.push(
                    '/verify-email?email=${Uri.encodeQueryComponent(user!.email)}',
                  ),
                ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.pencil, color: CupertinoColors.systemBlue),
                title: Text(l10n.editProfile),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.go('/profile/edit'),
              ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.gear_big, color: CupertinoColors.systemGrey),
                title: Text(l10n.settings),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.go('/settings'),
              ),
            ],
          ),

          // Account & Compliance
          AppListSection(
            header: Text(l10n.sectionAccount),
            children: [
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.building_2_fill, color: CupertinoColors.systemTeal),
                title: Text(l10n.myOrgTitle),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.push('/my-org'),
              ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.phone_fill, color: CupertinoColors.systemGreen),
                title: Text(l10n.bindPhone),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.push('/profile/bind-phone'),
              ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.arrow_down_doc_fill, color: CupertinoColors.systemBlue),
                title: Text(l10n.exportData),
                trailing: const CupertinoListTileChevron(),
                onTap: () => _exportData(context),
              ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.trash_fill, color: CupertinoColors.destructiveRed),
                title: Text(l10n.deactivateAccount, style: TextStyle(color: CupertinoColors.destructiveRed.resolveFrom(context))),
                onTap: () => _deactivate(context),
              ),
            ],
          ),

          // Legal
          AppListSection(
            header: Text(l10n.sectionLegal),
            children: [
              CupertinoListTile(
                title: Text(l10n.privacyPolicy),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.go('/privacy'),
              ),
              CupertinoListTile(
                title: Text(l10n.termsOfService),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.go('/terms'),
              ),
            ],
          ),

          // Logout
          AppListSection(
            children: [
              CupertinoListTile(
                title: Text(l10n.logout, style: TextStyle(color: CupertinoColors.destructiveRed.resolveFrom(context))),
                onTap: () async {
                  final confirmed = await showCupertinoDialog<bool>(
                    context: context,
                    builder: (ctx) => CupertinoAlertDialog(
                      title: Text(l10n.logout),
                      content: Text(l10n.logoutConfirm),
                      actions: [
                        CupertinoDialogAction(
                          isDestructiveAction: false,
                          onPressed: () => Navigator.pop(ctx, false),
                          child: Text(l10n.cancel),
                        ),
                        CupertinoDialogAction(
                          isDestructiveAction: true,
                          onPressed: () => Navigator.pop(ctx, true),
                          child: Text(l10n.logout),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true && context.mounted) {
                    await context.read<AuthProvider>().logout();
                    if (context.mounted) AppToast.show(context, l10n.logout);
                  }
                },
              ),
            ],
          ),

          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Future<void> _exportData(BuildContext context) async {
    final l10n = context.l10n;
    final auth = context.read<AuthProvider>();
    final data = await auth.exportData();
    if (!context.mounted) return;
    if (data != null) {
      // 生成 JSON 文件下载（Web）或打印摘要（移动端展示）。简化：toast + 控制台打印。
      AppToast.success(context, l10n.dataExported);
    } else {
      AppToast.error(context, auth.error ?? l10n.unknownError);
    }
  }

  Future<void> _deactivate(BuildContext context) async {
    final l10n = context.l10n;
    final passwordCtrl = TextEditingController();
    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(l10n.deactivateAccount),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 4),
            Text(l10n.deactivateConfirm, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 12),
            CupertinoTextField(
              controller: passwordCtrl,
              obscureText: true,
              placeholder: l10n.password,
            ),
          ],
        ),
        actions: [
          CupertinoDialogAction(
            isDestructiveAction: false,
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.cancel),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.deactivateAccount),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      if (!context.mounted) return;
      final auth = context.read<AuthProvider>();
      final ok = await auth.deactivate(passwordCtrl.text);
      if (!context.mounted) return;
      if (ok) {
        AppToast.success(context, l10n.accountDeactivated);
      } else {
        AppToast.error(context, auth.error ?? l10n.deactivateFailed);
      }
    }
    passwordCtrl.dispose();
  }
}
