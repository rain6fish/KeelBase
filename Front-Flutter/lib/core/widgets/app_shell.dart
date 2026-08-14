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
                ? CupertinoColors.separator.resolveFrom(context).withAlpha(40)
                : CupertinoColors.opaqueSeparator.resolveFrom(context),
            width: 0.5,
          ),
        ),
      ),
      child: ClipRect(
        child: BackdropFilter(
          filter: isDark
              ? _PseudoBlurFilter.blurDark
              : _PseudoBlurFilter.blurLight,
          child: Container(
            color: isDark
                ? const Color(0xCC000000)
                : CupertinoColors.systemBackground.resolveFrom(context).withAlpha(240),
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
      child: GestureDetector(
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
                    theme.primaryColor.withAlpha(230),
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
        return '';
    }
  }
}

/// 将 branch 索引映射到 tab 索引，跳过 index 2 的 More 按钮（branch 0/1 → 0/1，其余 +1）
int _branchToTab(int branch) => branch < 2 ? branch : branch + 1;

/// Lightweight pseudo-blur filter for the tab bar.
class _PseudoBlurFilter {
  _PseudoBlurFilter._();

  static final ColorFilter blurLight = ColorFilter.matrix(<double>[
    1, 0, 0, 0, 0, //
    0, 1, 0, 0, 0, //
    0, 0, 1, 0, 0, //
    0, 0, 0, 0.85, 0, //
  ]);

  static final ColorFilter blurDark = ColorFilter.matrix(<double>[
    1, 0, 0, 0, 0, //
    0, 1, 0, 0, 0, //
    0, 0, 1, 0, 0, //
    0, 0, 0, 0.75, 0, //
  ]);
}

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
