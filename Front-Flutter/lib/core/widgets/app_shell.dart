import 'dart:ui' show ImageFilter;

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import '../i18n/app_localizations.dart';
import 'more_menu_sheet.dart';

/// iOS-style bottom tab bar with blurred background.
class AppShell extends StatelessWidget {
  final StatefulNavigationShell navigationShell;

  const AppShell({super.key, required this.navigationShell});

  static const _tabs = <_TabItem>[
    _TabItem(icon: CupertinoIcons.house_fill, labelKey: 'tabHome'),
    _TabItem(icon: CupertinoIcons.calendar, labelKey: 'tabEvents'),
    _TabItem(icon: CupertinoIcons.ellipsis_circle_fill, labelKey: 'tabMore', isMore: true),
    _TabItem(icon: CupertinoIcons.square_grid_2x2, labelKey: 'tabExplore'),
    _TabItem(icon: CupertinoIcons.sparkles, labelKey: 'tabAi'),
    _TabItem(icon: CupertinoIcons.checkmark_square, labelKey: 'tabTodos'),
  ];

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = CupertinoTheme.of(context);
    final selectedIndex = navigationShell.currentIndex;
    final isDark = CupertinoTheme.brightnessOf(context) == Brightness.dark;
    // AppShell 期望 6 个 Tab，且 More 固定在 index 2，与 router 的 5 个
    // StatefulShellBranch 一一对应；增删 Tab/Branch 时在此尽早失败。
    assert(_tabs.length == 6 && _tabs[2].isMore,
        'AppShell expects 6 tabs with the More button at index 2');

    // Use a plain ColoredBox instead of nested CupertinoPageScaffold
    // to avoid double safe-area + gray gap issues.
    return ColoredBox(
      color: theme.scaffoldBackgroundColor,
      child: Column(
        children: [
          // Main content — fills all remaining space above the tab bar
          Expanded(child: navigationShell),

          // Tab bar
          _buildTabBar(context, l10n, theme, selectedIndex, isDark),
        ],
      ),
    );
  }

  Widget _buildTabBar(
    BuildContext context,
    AppLocalizations l10n,
    CupertinoThemeData theme,
    int selectedIndex,
    bool isDark,
  ) {
    return Container(
      height: 48 + MediaQuery.of(context).padding.bottom,
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: isDark
                ? CupertinoColors.separator
                    .resolveFrom(context)
                    .withValues(alpha: 40 / 255)
                : CupertinoColors.opaqueSeparator.resolveFrom(context),
            width: 0.5,
          ),
        ),
      ),
      child: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            color: isDark
                ? const Color(0xCC000000)
                : CupertinoColors.systemBackground
                    .resolveFrom(context)
                    .withValues(alpha: 240 / 255),
            padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
            child: Row(
              children: List.generate(_tabs.length, (i) {
                final tab = _tabs[i];
                final isSelected = i == _branchToTab(selectedIndex) && !tab.isMore;

                if (tab.isMore) {
                  return _buildMoreButton(context, theme);
                }

                return Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      if (i <= 1) {
                        navigationShell.goBranch(i);
                      } else {
                        navigationShell.goBranch(i - 1);
                      }
                    },
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          tab.icon,
                          size: 24,
                          color: isSelected
                              ? theme.primaryColor
                              : CupertinoColors.systemGrey.resolveFrom(context),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _label(l10n, tab.labelKey),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                            color: isSelected
                                ? theme.primaryColor
                                : CupertinoColors.systemGrey.resolveFrom(context),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMoreButton(BuildContext context, CupertinoThemeData theme) {
    return Expanded(
      child: Semantics(
        button: true,
        label: _moreLabel(context),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => showMoreMenuSheet(context),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      theme.primaryColor.withValues(alpha: 230 / 255),
                      theme.primaryColor,
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: Icon(
                    CupertinoIcons.ellipsis,
                    size: 16,
                    color: CupertinoColors.white,
                  ),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                _moreLabel(context),
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w400,
                  color: CupertinoColors.systemGrey,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _moreLabel(BuildContext context) {
    return AppLocalizations.of(context).tabMore;
  }

  String _label(AppLocalizations l10n, String key) {
    switch (key) {
      case 'tabHome':
        return l10n.tabHome;
      case 'tabEvents':
        return l10n.tabEvents;
      case 'tabMore':
        return l10n.tabMore;
      case 'tabExplore':
        return l10n.tabExplore;
      case 'tabProfile':
        return l10n.tabProfile;
      case 'tabAi':
        return l10n.tabAi;
      case 'tabTodos':
        return l10n.tabTodos;
      default:
        // 新增 Tab 忘记加 labelKey 时尽早暴露，而不是静默渲染空标签
        assert(false, 'Unknown tab labelKey: $key');
        return '';
    }
  }
}

/// 将 branch 索引映射到 tab 索引，跳过 index 2 的 More 按钮（branch 0/1 → 0/1，其余 +1）
int _branchToTab(int branch) => branch < 2 ? branch : branch + 1;

class _TabItem {
  final IconData icon;
  final String labelKey;
  final bool isMore;

  const _TabItem({
    required this.icon,
    required this.labelKey,
    this.isMore = false,
  });
}
