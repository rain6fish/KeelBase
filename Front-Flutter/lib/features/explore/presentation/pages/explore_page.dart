// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/api/capabilities_provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_list_section.dart';

class ExplorePage extends StatelessWidget {
  const ExplorePage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final caps = context.watch<CapabilitiesProvider>();
    // MOD-4：search 禁用时隐藏全局搜索入口
    final searchEnabled = caps.isFeatureEnabled('search');

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.exploreTitle),
      ),
      child: ListView(
        padding: const EdgeInsets.only(top: 20),
        children: [
          // PL-4.1 全局搜索入口
          if (searchEnabled)
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
              // MOD-4：业务模块项按 /app/capabilities 显隐（未加载/失败 → 全显）
              if (caps.hasBusinessModule('events'))
                CupertinoListTile(
                  leading: const Icon(CupertinoIcons.calendar, color: CupertinoColors.systemRed),
                  title: Text(l10n.tabEvents),
                  trailing: const CupertinoListTileChevron(),
                  onTap: () => context.push('/events'),
                ),
              if (caps.hasBusinessModule('todos'))
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
              if (caps.hasBusinessModule('crm'))
                CupertinoListTile(
                  leading: const Icon(CupertinoIcons.person_3, color: CupertinoColors.systemIndigo),
                  title: Text(l10n.crmExploreEntry),
                  trailing: const CupertinoListTileChevron(),
                  onTap: () => context.push('/crm'),
                ),
              if (caps.hasBusinessModule('pm'))
                CupertinoListTile(
                  leading: const Icon(CupertinoIcons.briefcase, color: CupertinoColors.systemTeal),
                  title: Text(l10n.pmExploreEntry),
                  trailing: const CupertinoListTileChevron(),
                  onTap: () => context.push('/pm'),
                ),
              if (caps.hasBusinessModule('approval'))
                CupertinoListTile(
                  leading: const Icon(CupertinoIcons.checkmark_seal, color: CupertinoColors.systemGreen),
                  title: Text(l10n.apExploreEntry),
                  trailing: const CupertinoListTileChevron(),
                  onTap: () => context.push('/approval'),
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
