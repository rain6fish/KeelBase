import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../events/data/models/event_model.dart';
import '../../../auth/data/models/user_model.dart';
import '../../../ai/data/models/conversation_summary.dart';
import '../providers/search_provider.dart';

/// 全局搜索页（PL-4.1）：搜索框 + 历史/热词 + 事件/用户/对话 Tab
class SearchPage extends StatefulWidget {
  const SearchPage({super.key});

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final _searchCtrl = TextEditingController();
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final p = context.read<SearchProvider>();
      p.loadHistory();
      p.loadConversations();
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _search(String q) {
    final text = q.trim();
    _searchCtrl.text = text;
    _searchCtrl.selection = TextSelection.collapsed(offset: text.length);
    context.read<SearchProvider>().search(text);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<SearchProvider>();
    final events = provider.result.events;
    final users = provider.result.users;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          previousPageTitle: l10n.back,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        middle: CupertinoSearchTextField(
          controller: _searchCtrl,
          placeholder: l10n.globalSearchHint,
          onSubmitted: (_) => _search(_searchCtrl.text),
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
                  2: Text(l10n.searchConversationsTab),
                },
                onValueChanged: (v) => setState(() => _tab = v ?? 0),
              ),
            const SizedBox(height: 8),
            Expanded(
              child: provider.loading
                  ? const Center(child: CupertinoActivityIndicator())
                  : provider.query.isEmpty
                      ? _emptyState(l10n, provider)
                      : _tab == 0
                          ? _eventsList(l10n, events)
                          : _tab == 1
                              ? _usersList(l10n, users)
                              : _conversationsList(l10n, provider.filteredConversations),
            ),
          ],
        ),
      ),
    );
  }

  /// 空状态：最近搜索 + 热门搜索 chips
  Widget _emptyState(AppLocalizations l10n, SearchProvider provider) {
    final history = provider.history;
    final showHot = history.isEmpty;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (history.isNotEmpty) ...[
          Row(children: [
            Text(l10n.searchHistoryTitle,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: CupertinoColors.systemGrey.resolveFrom(context))),
            const Spacer(),
            GestureDetector(
              onTap: () => context.read<SearchProvider>().clearHistory(),
              child: Text(l10n.clearSearchHistory,
                  style: TextStyle(fontSize: 13, color: CupertinoColors.systemBlue.resolveFrom(context))),
            ),
          ]),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: history.map((h) => _chip(h)).toList(),
          ),
          const SizedBox(height: 24),
        ],
        if (showHot) ...[
          Text(l10n.searchHotTitle,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: CupertinoColors.systemGrey.resolveFrom(context))),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: SearchProvider.hotKeywords.map((h) => _chip(h)).toList(),
          ),
        ],
        if (!provider.historyLoaded)
          const Padding(
            padding: EdgeInsets.only(top: 20),
            child: Center(child: CupertinoActivityIndicator()),
          ),
      ],
    );
  }

  Widget _chip(String label) {
    return GestureDetector(
      onTap: () => _search(label),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey.withAlpha(20),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(label, style: const TextStyle(fontSize: 14)),
      ),
    );
  }

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

  Widget _conversationsList(AppLocalizations l10n, List<ConversationSummary> conversations) {
    if (conversations.isEmpty) {
      return Center(child: Text(l10n.noSearchResults, style: const TextStyle(fontSize: 15)));
    }
    return ListView.separated(
      itemCount: conversations.length,
      separatorBuilder: (_, _) => Container(
        height: 1,
        margin: const EdgeInsets.only(left: 60),
        color: CupertinoColors.systemGrey.withAlpha(30),
      ),
      itemBuilder: (_, i) {
        final c = conversations[i];
        return CupertinoListTile(
          leading: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: CupertinoColors.systemPurple.withAlpha(30),
              shape: BoxShape.circle,
            ),
            child: const Icon(CupertinoIcons.sparkles, size: 18, color: CupertinoColors.systemPurple),
          ),
          title: Text(c.previewTitle, overflow: TextOverflow.ellipsis),
          onTap: () => context.push('/ai/history'),
        );
      },
    );
  }
}
