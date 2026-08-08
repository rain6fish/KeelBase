import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../ai/presentation/providers/ai_chat_provider.dart';
import '../../../events/data/repositories/events_repository.dart';
import '../../../events/data/models/event_model.dart';
import '../../../insights/presentation/providers/insights_provider.dart';
import '../../../insights/presentation/widgets/insights_card.dart';
import '../../../announcements/presentation/providers/announcement_provider.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  final _aiInputCtrl = TextEditingController();
  List<EventModel> _todayEvents = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadToday();
    _loadInsights();
    _checkAnnouncement();
  }

  void _loadInsights() {
    // 未登录时不请求；登录后由 provider 加载
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<InsightsProvider>().load();
    });
  }

  Future<void> _checkAnnouncement() async {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final show = await context.read<AnnouncementProvider>().check();
      if (!mounted || !show) return;
      final announcement = context.read<AnnouncementProvider>().latest;
      if (announcement == null) return;
      context.read<AnnouncementProvider>().markShown();
      showCupertinoDialog<void>(
        context: context,
        builder: (ctx) => CupertinoAlertDialog(
          title: Text(announcement.title),
          content: SingleChildScrollView(
            child: Text(announcement.body?.isNotEmpty == true ? announcement.body! : announcement.title),
          ),
          actions: [
            CupertinoDialogAction(
              isDefaultAction: true,
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(context.l10n.announcementDismiss),
            ),
          ],
        ),
      );
    });
  }

  @override
  void dispose() {
    _aiInputCtrl.dispose();
    super.dispose();
  }

  void _onAiSubmit() {
    final text = _aiInputCtrl.text.trim();
    if (text.isEmpty) return;
    _aiInputCtrl.clear();
    context.read<AiChatProvider>().sendFromHome(text, '/ai');
    context.push('/ai');
  }

  Future<void> _loadToday() async {
    setState(() => _loading = true);
    try {
      final repo = context.read<EventsRepository>();
      final now = DateTime.now();
      final start = '${now.year}-${now.month.toString().padLeft(2, "0")}-${now.day.toString().padLeft(2, "0")}';
      _todayEvents = await repo.getEvents(start, start);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Color _color(EventColorRole r) {
    switch (r) {
      case EventColorRole.blue: return CupertinoColors.systemBlue;
      case EventColorRole.red: return CupertinoColors.systemRed;
      case EventColorRole.green: return CupertinoColors.systemGreen;
      case EventColorRole.orange: return CupertinoColors.systemOrange;
      case EventColorRole.purple: return CupertinoColors.systemPurple;
      case EventColorRole.cyan: return CupertinoColors.systemCyan;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = CupertinoTheme.of(context);
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final name = user?.nickname ?? user?.username ?? 'User';
    final initial = name[0].toUpperCase();
    final today = DateTime.now();
    final dateStr = DateFormat(l10n.isZh ? 'M月d日 EEEE' : 'EEEE, MMMM d').format(today);

    final actions = <_QuickAction>[
      _QuickAction(CupertinoIcons.calendar_badge_plus, l10n.createEvent, CupertinoColors.systemBlue, () => context.push('/events/create')),
      _QuickAction(CupertinoIcons.cloud_upload, l10n.uploadFile, CupertinoColors.systemGreen, () => context.push('/explore')),
      _QuickAction(CupertinoIcons.person_crop_circle, l10n.editProfile, CupertinoColors.systemOrange, () => context.push('/profile/edit')),
      _QuickAction(CupertinoIcons.gear_big, l10n.settings, CupertinoColors.systemPurple, () => context.push('/settings')),
    ];

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(middle: Text(l10n.tabHome)),
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        children: [
          const SizedBox(height: 20),
          GestureDetector(
            onTap: () => context.push('/profile'),
            child: Row(children: [
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(
                  gradient: user?.avatarUrl != null && user!.avatarUrl!.isNotEmpty
                      ? null
                      : LinearGradient(
                          colors: [theme.primaryColor, theme.primaryColor.withAlpha(180)],
                          begin: Alignment.topLeft, end: Alignment.bottomRight,
                        ),
                  shape: BoxShape.circle,
                  image: user?.avatarUrl != null && user!.avatarUrl!.isNotEmpty
                      ? DecorationImage(
                          image: NetworkImage(AppConstants.resolveUrl(user.avatarUrl)),
                          fit: BoxFit.cover,
                        )
                      : null,
                ),
                alignment: Alignment.center,
                child: user?.avatarUrl == null || user!.avatarUrl!.isEmpty
                    ? Text(initial, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: CupertinoColors.white))
                    : null,
              ),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l10n.welcome(name.split(' ')[0]), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: theme.textTheme.textStyle.color)),
                Text(dateStr, style: TextStyle(fontSize: 14, color: CupertinoColors.systemGrey.resolveFrom(context))),
              ])),
            ]),
          ),
          const SizedBox(height: 24),
          _todayCard(l10n, theme),
          const SizedBox(height: 20),
          _insightsCard(theme),
          const SizedBox(height: 20),
          Text(l10n.quickActions, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: theme.textTheme.textStyle.color)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: _actionCard(actions[0], theme)),
            const SizedBox(width: 12),
            Expanded(child: _actionCard(actions[1], theme)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: _actionCard(actions[2], theme)),
            const SizedBox(width: 12),
            Expanded(child: _actionCard(actions[3], theme)),
          ]),
          const SizedBox(height: 24),
          _searchInput(l10n, theme),
          const SizedBox(height: 12),
          _aiInput(l10n, theme),
          const SizedBox(height: 30),
        ],
      ),
    );
  }

  Widget _searchInput(AppLocalizations l10n, CupertinoThemeData theme) {
    return GestureDetector(
      onTap: () => context.push('/search'),
      child: Container(
        decoration: BoxDecoration(
          color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: CupertinoColors.systemGrey.withAlpha(60)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(children: [
          Icon(CupertinoIcons.search, size: 20, color: CupertinoColors.systemGrey),
          const SizedBox(width: 10),
          Text(
            l10n.globalSearchHint,
            style: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey.resolveFrom(context)),
          ),
        ]),
      ),
    );
  }

  Widget _aiInput(AppLocalizations l10n, CupertinoThemeData theme) {
    return Container(
      decoration: BoxDecoration(
        color: CupertinoColors.systemBackground.resolveFrom(context),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: CupertinoColors.black.withAlpha(8), blurRadius: 8, offset: const Offset(0, 1))],
      ),
      child: CupertinoTextField(
        controller: _aiInputCtrl,
        placeholder: l10n.aiInputHint,
        placeholderStyle: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey.resolveFrom(context)),
        style: TextStyle(fontSize: 15, color: theme.textTheme.textStyle.color),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.primaryColor.withAlpha(60)),
        ),
        prefix: Padding(
          padding: const EdgeInsets.only(right: 8),
          child: Icon(CupertinoIcons.sparkles, size: 22, color: theme.primaryColor),
        ),
        suffix: CupertinoButton(
          padding: const EdgeInsets.only(left: 4),
          minSize: 32,
          onPressed: () => _onAiSubmit(),
          child: Icon(CupertinoIcons.arrow_up_circle_fill, size: 28, color: theme.primaryColor),
        ),
        textInputAction: TextInputAction.send,
        onSubmitted: (_) => _onAiSubmit(),
      ),
    );
  }

  Widget _insightsCard(CupertinoThemeData theme) {
    final insights = context.watch<InsightsProvider>();
    return InsightsCard(
      insights: insights.insights,
      loading: insights.loading,
      error: insights.error,
      onRetry: () => context.read<InsightsProvider>().load(),
    );
  }

  Widget _todayCard(AppLocalizations l10n, CupertinoThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: CupertinoColors.systemBackground.resolveFrom(context),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: CupertinoColors.black.withAlpha(10), blurRadius: 12, offset: const Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(CupertinoIcons.calendar, size: 18, color: theme.primaryColor),
          const SizedBox(width: 8),
          Text(l10n.todaySchedule, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: theme.textTheme.textStyle.color)),
          const Spacer(),
          Text('${_todayEvents.length}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: theme.primaryColor)),
        ]),
        const SizedBox(height: 12),
        if (_loading)
          const Center(child: CupertinoActivityIndicator())
        else if (_todayEvents.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(l10n.noEventsToday, style: TextStyle(fontSize: 14, color: CupertinoColors.systemGrey.resolveFrom(context))),
          )
        else
          ...(_todayEvents.asMap().entries.map((entry) {
            final i = entry.key;
            final e = entry.value;
            final c = _color(e.colorRole);
            return Padding(
              padding: EdgeInsets.only(top: i > 0 ? 8 : 0),
              child: GestureDetector(
                onTap: () => context.push('/events/${e.id}/edit'),
                child: Row(children: [
                  Container(width: 3, height: 36, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(e.title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: theme.textTheme.textStyle.color), maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text('${e.startTime.toLocal().toString().substring(11, 16)} - ${e.endTime.toLocal().toString().substring(11, 16)}', style: TextStyle(fontSize: 12, color: CupertinoColors.systemGrey.resolveFrom(context))),
                  ])),
                  Icon(CupertinoIcons.chevron_right, size: 14, color: CupertinoColors.systemGrey.withAlpha(120)),
                ]),
              ),
            );
          })),
      ]),
    );
  }

  Widget _actionCard(_QuickAction a, CupertinoThemeData theme) {
    return GestureDetector(
      onTap: a.onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: CupertinoColors.systemBackground.resolveFrom(context),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: CupertinoColors.black.withAlpha(8), blurRadius: 8, offset: const Offset(0, 1))],
        ),
        child: Column(children: [
          Container(width: 40, height: 40, decoration: BoxDecoration(color: a.color.withAlpha(20), borderRadius: BorderRadius.circular(12)),
            child: Icon(a.icon, size: 22, color: a.color)),
          const SizedBox(height: 8),
          Text(a.label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.textTheme.textStyle.color), textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}

class _QuickAction {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  _QuickAction(this.icon, this.label, this.color, this.onTap);
}
