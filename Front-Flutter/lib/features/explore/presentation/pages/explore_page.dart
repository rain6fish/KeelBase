import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_list_section.dart';

class ExplorePage extends StatelessWidget {
  const ExplorePage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.exploreTitle),
      ),
      child: ListView(
        padding: const EdgeInsets.only(top: 20),
        children: [
          // PL-4.1 全局搜索入口
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
            child: GestureDetector(
              onTap: () => context.push('/search'),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: CupertinoColors.systemGrey.withAlpha(50)),
                ),
                child: Row(children: [
                  const Icon(CupertinoIcons.search, size: 18, color: CupertinoColors.systemGrey),
                  const SizedBox(width: 10),
                  Text(
                    l10n.globalSearchHint,
                    style: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey.resolveFrom(context)),
                  ),
                ]),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Text(
              l10n.exploreDesc,
              style: TextStyle(
                fontSize: 15,
                color: CupertinoColors.systemGrey.resolveFrom(context),
              ),
            ),
          ),
          AppListSection(
            children: [
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.bell, color: CupertinoColors.systemRed),
                title: Text(l10n.notifications),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.push('/notifications'),
              ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.calendar, color: CupertinoColors.systemRed),
                title: Text(l10n.tabEvents),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.push('/events'),
              ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.checkmark_square, color: CupertinoColors.systemGreen),
                title: Text(l10n.tabTodos),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.go('/todos'),
              ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.cloud_upload, color: CupertinoColors.systemBlue),
                title: Text(l10n.uploadFile),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.push('/explore/upload'),
              ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.pencil, color: CupertinoColors.systemOrange),
                title: Text(l10n.editProfile),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.push('/profile/edit'),
              ),
              CupertinoListTile(
                leading: const Icon(CupertinoIcons.gear_big, color: CupertinoColors.systemGrey),
                title: Text(l10n.settings),
                trailing: const CupertinoListTileChevron(),
                onTap: () => context.push('/settings'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
