import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../events/data/models/event_model.dart';
import '../../../auth/data/models/user_model.dart';
import '../providers/search_provider.dart';

/// 全局搜索页：搜索框 + 事件/用户结果 Tab
class SearchPage extends StatefulWidget {
  const SearchPage({super.key});

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final _searchCtrl = TextEditingController();
  int _tab = 0;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onSubmit() {
    context.read<SearchProvider>().search(_searchCtrl.text);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<SearchProvider>();
    final events = provider.result.events;
    final users = provider.result.users;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: CupertinoSearchTextField(
          controller: _searchCtrl,
          placeholder: l10n.globalSearchHint,
          onSubmitted: (_) => _onSubmit(),
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            if (provider.query.isNotEmpty)
              CupertinoSlidingSegmentedControl<int>(
                groupValue: _tab,
                children: {
                  0: Text(l10n.searchEventsTab),
                  1: Text(l10n.searchUsersTab),
                },
                onValueChanged: (v) => setState(() => _tab = v ?? 0),
              ),
            const SizedBox(height: 8),
            Expanded(
              child: provider.loading
                  ? const Center(child: CupertinoActivityIndicator())
                  : provider.query.isEmpty
                      ? _emptyHint(l10n)
                      : _tab == 0
                          ? _eventsList(l10n, events)
                          : _usersList(l10n, users),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyHint(AppLocalizations l10n) => Center(
        child: Text(
          l10n.searchHint,
          style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context)),
        ),
      );

  Widget _eventsList(AppLocalizations l10n, List<EventModel> events) {
    if (events.isEmpty) {
      return Center(child: Text(l10n.noSearchResults, style: const TextStyle(fontSize: 15)));
    }
    return ListView.separated(
      itemCount: events.length,
      separatorBuilder: (_, _) => Container(
        height: 1,
        margin: const EdgeInsets.only(left: 60),
        color: CupertinoColors.systemGrey.withAlpha(30),
      ),
      itemBuilder: (_, i) {
        final e = events[i];
        return CupertinoListTile(
          leading: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: CupertinoColors.systemBlue.withAlpha(30),
              shape: BoxShape.circle,
            ),
            child: const Icon(CupertinoIcons.calendar, size: 18, color: CupertinoColors.systemBlue),
          ),
          title: Text(e.title, overflow: TextOverflow.ellipsis),
          subtitle: Text(
            '${e.startTime.month}/${e.startTime.day} ${e.startTime.hour}:${e.startTime.minute.toString().padLeft(2, '0')}',
            style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context)),
          ),
        );
      },
    );
  }

  Widget _usersList(AppLocalizations l10n, List<UserModel> users) {
    if (users.isEmpty) {
      return Center(child: Text(l10n.noSearchResults, style: const TextStyle(fontSize: 15)));
    }
    return ListView.separated(
      itemCount: users.length,
      separatorBuilder: (_, _) => Container(
        height: 1,
        margin: const EdgeInsets.only(left: 60),
        color: CupertinoColors.systemGrey.withAlpha(30),
      ),
      itemBuilder: (_, i) {
        final u = users[i];
        return CupertinoListTile(
          leading: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: CupertinoColors.systemGreen.withAlpha(30),
              shape: BoxShape.circle,
            ),
            child: const Icon(CupertinoIcons.person_fill, size: 18, color: CupertinoColors.systemGreen),
          ),
          title: Text(u.displayName, overflow: TextOverflow.ellipsis),
          subtitle: Text(
            '@${u.username}',
            style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context)),
          ),
        );
      },
    );
  }
}
