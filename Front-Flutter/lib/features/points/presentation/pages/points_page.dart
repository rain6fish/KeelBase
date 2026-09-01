// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../../../core/widgets/loading_widget.dart';
import '../../data/models/points_models.dart';
import '../providers/points_provider.dart';

/// GROWTH-3：积分 / 每日签到 / 排行榜 / 成就 页面。
class PointsPage extends StatefulWidget {
  const PointsPage({super.key});

  @override
  State<PointsPage> createState() => _PointsPageState();
}

class _PointsPageState extends State<PointsPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<PointsProvider>().load();
    });
  }

  Future<void> _checkIn() async {
    final provider = context.read<PointsProvider>();
    final ok = await provider.checkIn();
    if (!mounted) return;
    final l10n = context.l10n;
    if (ok) {
      final gained = provider.lastCheckIn?.points ?? 0;
      AppToast.success(context, l10n.pointsCheckInGained(gained));
    } else if (provider.error != null) {
      AppToast.error(context, l10n.pointsCheckInFailed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<PointsProvider>();
    final overview = provider.overview;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          onPressed: () => context.canPop() ? context.pop() : null,
        ),
        middle: Text(l10n.pointsTitle),
      ),
      child: provider.loading && overview == null
          ? const LoadingWidget()
          : provider.error != null && overview == null
              ? AppErrorView(
                  message: l10n.pointsLoadFailed,
                  actionLabel: l10n.retry,
                  onRetry: () => context.read<PointsProvider>().load(),
                )
              : overview == null
                  ? const SizedBox.shrink()
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        _BalanceCard(
                          overview: overview,
                          checkingIn: provider.checkingIn,
                          onCheckIn: _checkIn,
                        ),
                        const SizedBox(height: 24),
                        _AchievementsSection(achievements: provider.achievements),
                        const SizedBox(height: 24),
                        _LeaderboardSection(rows: provider.leaderboard),
                      ],
                    ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  final PointsOverview overview;
  final bool checkingIn;
  final VoidCallback onCheckIn;

  const _BalanceCard({
    required this.overview,
    required this.checkingIn,
    required this.onCheckIn,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = CupertinoTheme.of(context);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.primaryColor.withAlpha(16),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.pointsBalance,
                      style: TextStyle(
                        fontSize: 14,
                        color: theme.primaryColor,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${overview.balance}',
                      style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    l10n.pointsStreak,
                    style: TextStyle(fontSize: 13, color: theme.primaryColor),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.pointsStreakDays(overview.streak),
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (overview.todayCheckedIn)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: CupertinoColors.systemGreen.withAlpha(28),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(CupertinoIcons.checkmark_circle_fill,
                      color: CupertinoColors.systemGreen, size: 18),
                  const SizedBox(width: 6),
                  Text(
                    l10n.pointsCheckedInToday,
                    style: const TextStyle(
                      color: CupertinoColors.systemGreen,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            )
          else
            CupertinoButton(
              onPressed: checkingIn ? null : onCheckIn,
              padding: const EdgeInsets.symmetric(vertical: 12),
              color: theme.primaryColor,
              borderRadius: BorderRadius.circular(12),
              disabledColor: theme.primaryColor.withAlpha(80),
              child: checkingIn
                  ? const CupertinoActivityIndicator(color: CupertinoColors.white)
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(CupertinoIcons.star_circle_fill,
                            color: CupertinoColors.white, size: 18),
                        const SizedBox(width: 6),
                        Text(
                          l10n.pointsCheckIn,
                          style: const TextStyle(
                            color: CupertinoColors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
            ),
        ],
      ),
    );
  }
}

class _AchievementsSection extends StatelessWidget {
  final List<AchievementView> achievements;

  const _AchievementsSection({required this.achievements});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.pointsAchievements,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        if (achievements.isEmpty)
          _hint(l10n.pointsNoPoints)
        else
          ...achievements.map((a) => _AchievementTile(achievement: a)),
      ],
    );
  }
}

class _AchievementTile extends StatelessWidget {
  final AchievementView achievement;

  const _AchievementTile({required this.achievement});

  @override
  Widget build(BuildContext context) {
    final theme = CupertinoTheme.of(context);
    final ratio = achievement.target <= 0
        ? 0.0
        : (achievement.progress / achievement.target).clamp(0.0, 1.0);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(
            achievement.unlocked
                ? CupertinoIcons.gift_fill
                : CupertinoIcons.gift,
            size: 20,
            color: achievement.unlocked
                ? CupertinoColors.systemOrange
                : CupertinoColors.systemGrey,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        achievement.name,
                        style: const TextStyle(fontSize: 14),
                      ),
                    ),
                    Text(
                      '${achievement.progress} / ${achievement.target}',
                      style: TextStyle(
                        fontSize: 12,
                        color: achievement.unlocked
                            ? CupertinoColors.systemOrange
                            : CupertinoColors.systemGrey,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Container(
                  height: 5,
                  alignment: Alignment.centerLeft,
                  decoration: BoxDecoration(
                    color: theme.primaryColor.withAlpha(28),
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: FractionallySizedBox(
                    widthFactor: ratio,
                    child: Container(
                      decoration: BoxDecoration(
                        color: achievement.unlocked
                            ? CupertinoColors.systemOrange
                            : theme.primaryColor,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LeaderboardSection extends StatelessWidget {
  final List<LeaderboardRow> rows;

  const _LeaderboardSection({required this.rows});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.pointsLeaderboard,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        if (rows.isEmpty)
          _hint(l10n.pointsLeaderboardEmpty)
        else
          ...rows.indexed.map((entry) => _LeaderboardTile(rank: entry.$1 + 1, row: entry.$2)),
      ],
    );
  }
}

class _LeaderboardTile extends StatelessWidget {
  final int rank;
  final LeaderboardRow row;

  const _LeaderboardTile({required this.rank, required this.row});

  @override
  Widget build(BuildContext context) {
    final theme = CupertinoTheme.of(context);
    final avatarUrl = row.avatarUrl;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '$rank',
              style: TextStyle(
                fontSize: 15,
                fontWeight: rank <= 3 ? FontWeight.w700 : FontWeight.w400,
                color: rank <= 3 ? CupertinoColors.systemOrange : CupertinoColors.systemGrey,
              ),
            ),
          ),
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: theme.primaryColor.withAlpha(32),
            ),
            clipBehavior: Clip.antiAlias,
            child: (avatarUrl != null && avatarUrl.isNotEmpty)
                ? Image.network(
                    AppConstants.resolveUrl(avatarUrl),
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => _initialPlaceholder(theme, row.nickname),
                  )
                : _initialPlaceholder(theme, row.nickname),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              row.nickname ?? '-',
              style: const TextStyle(fontSize: 14),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text(
            '${row.points}',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: theme.primaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

Widget _hint(String text) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Text(text, style: const TextStyle(fontSize: 13, color: CupertinoColors.systemGrey)),
  );
}

/// 昵称首字母占位（无头像 / 头像加载失败时的回退）。
Widget _initialPlaceholder(CupertinoThemeData theme, String? nickname) {
  return Text(
    _initialOf(nickname),
    style: TextStyle(color: theme.primaryColor, fontSize: 14),
  );
}

/// 取昵称首字符（按字素簇，避免切断 emoji 等 surrogate pair）。
String _initialOf(String? nickname) {
  if (nickname == null || nickname.isEmpty) return '?';
  return nickname.characters.first;
}
