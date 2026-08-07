import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../i18n/app_localizations.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';

/// Navigate to a route in the next microtask cycle, to avoid
/// Navigator key reservation conflicts during tap handling.
void _navigate(BuildContext context, String route) {
  Future.microtask(() => GoRouter.of(context).push(route));
}

void showMoreMenuSheet(BuildContext context) {
  final l10n = context.l10n;

  final allItems = <_MoreItem>[
    _MoreItem(CupertinoIcons.calendar_badge_plus, l10n.createEvent, CupertinoColors.systemBlue,
        () => _navigate(context, '/events/create')),
    _MoreItem(CupertinoIcons.person_crop_circle, l10n.profileEntry, CupertinoColors.systemIndigo,
        () => _navigate(context, '/profile')),
    _MoreItem(CupertinoIcons.pencil, l10n.editProfile, CupertinoColors.systemOrange,
        () => _navigate(context, '/profile/edit')),
    _MoreItem(CupertinoIcons.gear_big, l10n.settings, CupertinoColors.systemPurple,
        () => _navigate(context, '/settings')),
    _MoreItem(CupertinoIcons.cloud_upload, l10n.uploadFile, CupertinoColors.systemGreen,
        () => _navigate(context, '/explore')),
    _MoreItem(CupertinoIcons.doc_plaintext, l10n.privacyPolicy, CupertinoColors.systemTeal,
        () => _navigate(context, '/privacy')),
    _MoreItem(CupertinoIcons.doc_text, l10n.termsOfService, CupertinoColors.systemBrown,
        () => _navigate(context, '/terms')),
    _MoreItem(CupertinoIcons.question_circle, l10n.about, CupertinoColors.systemCyan,
        () => Navigator.pop(context)),
    _MoreItem(CupertinoIcons.square_arrow_right, l10n.logout, CupertinoColors.destructiveRed,
        () => _confirmLogout(context)),
  ];

  showCupertinoModalPopup(
    context: context,
    builder: (ctx) => _MoreSheet(allItems: allItems, l10n: l10n),
  );
}

class _MoreSheet extends StatefulWidget {
  final List<_MoreItem> allItems;
  final AppLocalizations l10n;
  const _MoreSheet({required this.allItems, required this.l10n});
  @override
  State<_MoreSheet> createState() => _MoreSheetState();
}

class _MoreSheetState extends State<_MoreSheet> {
  int _page = 0;
  late int _totalPages;
  late PageController _ctrl;

  @override
  void initState() {
    super.initState();
    _totalPages = (widget.allItems.length + 8) ~/ 9;
    _ctrl = PageController();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = CupertinoTheme.brightnessOf(context) == Brightness.dark;
    final t = CupertinoTheme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1C1C1E) : CupertinoColors.systemBackground.resolveFrom(context),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Title + page label
              Row(
                children: [
                  Text(widget.l10n.tabMore, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: CupertinoColors.label)),
                  if (_totalPages > 1)
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Text('${_page + 1}/$_totalPages',
                        style: TextStyle(fontSize: 14, color: CupertinoColors.systemGrey.resolveFrom(context))),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              // Pages
              SizedBox(
                height: 260,
                child: PageView(
                  controller: _ctrl,
                  onPageChanged: (p) => setState(() => _page = p),
                  children: List.generate(_totalPages, (pi) {
                    final start = pi * 9;
                    final end = (start + 9).clamp(0, widget.allItems.length);
                    return _buildGrid(context, widget.allItems.sublist(start, end), t);
                  }),
                ),
              ),
              // Page dots
              if (_totalPages > 1)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(_totalPages, (i) {
                      return GestureDetector(
                        onTap: () => _ctrl.animateToPage(i, duration: const Duration(milliseconds: 200), curve: Curves.easeOut),
                        child: Container(
                          width: 6, height: 6,
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          decoration: BoxDecoration(
                            color: CupertinoColors.systemGrey.withAlpha(i == _page ? 180 : 60),
                            shape: BoxShape.circle,
                          ),
                        ),
                      );
                    }),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

Widget _buildGrid(BuildContext context, List<_MoreItem> items, CupertinoThemeData t) {
  return Column(
    children: List.generate(3, (row) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: List.generate(3, (col) {
            final idx = row * 3 + col;
            if (idx >= items.length) {
              return const Expanded(child: SizedBox.shrink());
            }
            final item = items[idx];
            return Expanded(
              child: GestureDetector(
                onTap: item.onTap,
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 5),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: CupertinoColors.separator.resolveFrom(context).withAlpha(25)),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(width: 34, height: 34,
                        decoration: BoxDecoration(color: item.color.withAlpha(20), borderRadius: BorderRadius.circular(10)),
                        child: Icon(item.icon, size: 19, color: item.color),
                      ),
                      const SizedBox(height: 4),
                      Text(item.label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: CupertinoColors.label),
                        maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      );
    }),
  );
}

void _confirmLogout(BuildContext context) {
  final l10n = context.l10n;
  final auth = context.read<AuthProvider>();

  showCupertinoDialog<void>(
    context: context,
    builder: (ctx) => CupertinoAlertDialog(
      title: Text(l10n.logout),
      content: Text(l10n.logoutConfirm),
      actions: [
        CupertinoDialogAction(isDestructiveAction: false, onPressed: () => Navigator.pop(ctx), child: Text(l10n.cancel)),
        CupertinoDialogAction(isDestructiveAction: true, onPressed: () {
          Navigator.pop(ctx); // close dialog
          auth.logout(); // triggers auth state change → GoRouter redirect → sheet auto-dismissed
        }, child: Text(l10n.logout)),
      ],
    ),
  );
}

class _MoreItem {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  _MoreItem(this.icon, this.label, this.color, this.onTap);
}
