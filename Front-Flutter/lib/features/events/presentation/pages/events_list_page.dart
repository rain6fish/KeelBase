import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart' show Material;
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_empty_view.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/loading_widget.dart';
import '../../../../core/widgets/app_toast.dart';
import '../providers/events_provider.dart';
import '../../data/models/event_model.dart';

class EventsListPage extends StatefulWidget {
  const EventsListPage({super.key});
  @override
  State<EventsListPage> createState() => _EventsListPageState();
}

class _EventsListPageState extends State<EventsListPage> {
  final ScrollController _scrollCtrl = ScrollController();
  final TextEditingController _searchCtrl = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  DateTime? _srchStart;
  DateTime? _srchEnd;
  bool _showSearch = false;
  bool _dayFiltered = false; // true = list shows only selected date's events
  bool _firstLoad = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<EventsProvider>().loadCalendar();
    });
    _scrollCtrl.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollCtrl.removeListener(_onScroll);
    _scrollCtrl.dispose();
    _searchCtrl.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 200) {
      final p = context.read<EventsProvider>();
      if (p.mode == EventsMode.all && p.hasMore) p.loadMoreAll();
      else if (p.mode == EventsMode.search && p.hasMore) p.loadMore();
    }
  }

  void _toggleSearch() {
    setState(() => _showSearch = !_showSearch);
    if (_showSearch) {}
    else {
      _searchCtrl.clear();
      _srchStart = null;
      _srchEnd = null;
    }
  }

  void _search() {
    final p = context.read<EventsProvider>();
    p.setKeyword(_searchCtrl.text.trim());
    p.setDateRange(_srchStart, _srchEnd);
    p.search(reload: true);
    _toggleSearch();
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
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.tabEvents),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CupertinoButton(
              padding: EdgeInsets.zero,
              child: const Icon(CupertinoIcons.search, size: 22),
              onPressed: _toggleSearch,
            ),
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () => context.push('/events/create'),
              child: const Icon(CupertinoIcons.plus_circle_fill, size: 24),
            ),
          ],
        ),
      ),
      child: Stack(
        children: [
          // Main content
          Consumer<EventsProvider>(builder: (_, p, __) => Column(children: [
            _buildHeader(p),
            _buildViewToggle(p),
            if (p.viewMode == CalendarViewMode.month) _buildMonthGrid(p),
            if (p.viewMode != CalendarViewMode.month) _buildDateStrip(p),
            Expanded(child: _buildBody(p)),
          ])),
          // Backdrop overlay (covers content, dismisses search on tap)
          if (_showSearch)
            Positioned.fill(
              child: GestureDetector(
                onTap: () => _toggleSearch(),
                behavior: HitTestBehavior.translucent,
                child: Container(color: CupertinoColors.black.withAlpha(40)),
              ),
            ),
          // Search panel (on TOP of backdrop so user can interact with it)
          if (_showSearch) _buildSearchPanel(),
        ],
      ),
    );
  }

  // ═══════════════ 搜索面板（顶部门帘式） ═══════════════

  Widget _buildSearchPanel() {
    final l = context.l10n;
    final t = CupertinoTheme.of(context);
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: GestureDetector(
        onTap: () {}, // absorb tap, don't pass through to backdrop
        child: Material(
        elevation: 4,
        color: CupertinoColors.systemBackground.resolveFrom(context),
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Search input
                CupertinoTextField(
                  focusNode: _searchFocus,
                  controller: _searchCtrl,
                  placeholder: l.searchHint,
                  placeholderStyle: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey.resolveFrom(context)),
                  style: TextStyle(fontSize: 15, color: t.textTheme.textStyle.color),
                  decoration: BoxDecoration(
                    color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: CupertinoColors.systemGrey.withAlpha(60)),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  prefix: const Padding(
                    padding: EdgeInsets.only(left: 6),
                    child: Icon(CupertinoIcons.search, size: 18, color: CupertinoColors.systemGrey),
                  ),
                  suffix: _searchCtrl.text.isNotEmpty
                      ? CupertinoButton(
                          padding: EdgeInsets.zero,
                          child: const Icon(CupertinoIcons.clear_circled_solid, size: 18),
                          onPressed: () { _searchCtrl.clear(); setState(() {}); },
                        )
                      : null,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _search(),
                ),
                const SizedBox(height: 12),
                // Date range
                Row(
                  children: [
                    Expanded(
                      child: CupertinoButton(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        borderRadius: BorderRadius.circular(8),
                        color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
                        child: Text(
                          _srchStart != null ? DateFormat('yyyy-MM-dd').format(_srchStart!) : l.startTime,
                          style: TextStyle(fontSize: 13, color: _srchStart != null ? t.textTheme.textStyle.color : CupertinoColors.systemGrey.resolveFrom(context)),
                        ),
                        onPressed: () => _datePicker(true),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Text('—', style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context))),
                    ),
                    Expanded(
                      child: CupertinoButton(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        borderRadius: BorderRadius.circular(8),
                        color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
                        child: Text(
                          _srchEnd != null ? DateFormat('yyyy-MM-dd').format(_srchEnd!) : l.endTime,
                          style: TextStyle(fontSize: 13, color: _srchEnd != null ? t.textTheme.textStyle.color : CupertinoColors.systemGrey.resolveFrom(context)),
                        ),
                        onPressed: () => _datePicker(false),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Buttons
                Row(
                  children: [
                    CupertinoButton(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      borderRadius: BorderRadius.circular(8),
                      color: CupertinoColors.tertiarySystemBackground.resolveFrom(context),
                      child: Text(l.cancel, style: TextStyle(fontSize: 13, color: t.textTheme.textStyle.color)),
                      onPressed: () => _toggleSearch(),
                    ),
                    const SizedBox(width: 8),
                    CupertinoButton(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      borderRadius: BorderRadius.circular(8),
                      color: t.primaryColor ?? CupertinoColors.systemBlue,
                      child: Text(l.allEvents, style: const TextStyle(fontSize: 13, color: CupertinoColors.white, fontWeight: FontWeight.w600)),
                      onPressed: () {
                        context.read<EventsProvider>().loadAll(reload: true);
                        _toggleSearch();
                      },
                    ),
                    const SizedBox(width: 8),
                    CupertinoButton(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      borderRadius: BorderRadius.circular(8),
                      color: t.primaryColor ?? CupertinoColors.systemBlue,
                      child: Text(l.searchEvents, style: const TextStyle(fontSize: 13, color: CupertinoColors.white, fontWeight: FontWeight.w600)),
                      onPressed: _search,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
      ),
    );
  }

  // ═══════════════ 视图切换 ═══════════════

  Widget _buildViewToggle(EventsProvider p) {
    final t = CupertinoTheme.of(context);
    final l = context.l10n;
    return Container(
      color: CupertinoColors.systemBackground.resolveFrom(context),
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 6),
      child: Row(children: [
        _modeBtn(l.calendarDay, p.viewMode == CalendarViewMode.day, () {
          setState(() => _dayFiltered = false);
          p.setViewMode(CalendarViewMode.day);
        }, t),
        const SizedBox(width: 8),
        _modeBtn(l.calendarWeek, p.viewMode == CalendarViewMode.week, () {
          setState(() => _dayFiltered = false);
          p.setViewMode(CalendarViewMode.week);
        }, t),
        const SizedBox(width: 8),
        _modeBtn(l.calendarMonth, p.viewMode == CalendarViewMode.month, () {
          setState(() => _dayFiltered = false);
          p.setViewMode(CalendarViewMode.month);
        }, t),
      ]),
    );
  }

  Widget _modeBtn(String label, bool sel, VoidCallback onTap, CupertinoThemeData t) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 7),
        decoration: BoxDecoration(
          color: sel ? (t.primaryColor ?? CupertinoColors.systemBlue) : const Color(0x00000000),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: sel ? (t.primaryColor ?? CupertinoColors.systemBlue) : CupertinoColors.systemGrey.withAlpha(100)),
        ),
        child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: sel ? CupertinoColors.white : t.textTheme.textStyle.color)),
      ),
    );
  }

  // ═══════════════ 日历头部 ═══════════════

  Widget _buildHeader(EventsProvider p) {
    final t = CupertinoTheme.of(context);
    final l = context.l10n;
    final we = p.weekStart.add(const Duration(days: 6));
    final title = l.isZh
        ? '${p.weekStart.year}年${p.weekStart.month}月'
        : DateFormat('MMMM yyyy').format(p.weekStart);
    final week = l.isZh
        ? '${p.weekStart.month}月${p.weekStart.day}日-${we.month}月${we.day}日'
        : '${DateFormat("MMM d").format(p.weekStart)} - ${DateFormat("MMM d").format(we)}';
    final isCur = _sameWeek(p.weekStart, DateTime.now());

    return Container(
      color: CupertinoColors.systemBackground.resolveFrom(context),
      padding: const EdgeInsets.fromLTRB(16, 6, 8, 0),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: t.textTheme.textStyle.color)),
          const SizedBox(height: 2),
          Text(week, style: TextStyle(fontSize: 13, color: CupertinoColors.systemGrey.resolveFrom(context))),
        ])),
        if (!isCur)
          CupertinoButton(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            borderRadius: BorderRadius.circular(8),
            color: (t.primaryColor ?? CupertinoColors.systemBlue).withAlpha(25),
            child: Text(l.today, style: TextStyle(fontSize: 14, color: t.primaryColor ?? CupertinoColors.systemBlue, fontWeight: FontWeight.w600)),
            onPressed: () => p.goToday(),
          ),
        CupertinoButton(padding: const EdgeInsets.all(6), minSize: 32,
          child: Icon(CupertinoIcons.chevron_left, size: 18, color: t.primaryColor ?? CupertinoColors.systemBlue),
          onPressed: () { p.prevWeek(); }),
        CupertinoButton(padding: const EdgeInsets.all(6), minSize: 32,
          child: Icon(CupertinoIcons.chevron_right, size: 18, color: t.primaryColor ?? CupertinoColors.systemBlue),
          onPressed: () { p.nextWeek(); }),
      ]),
    );
  }

  // ═══════════════ 月历网格 ═══════════════

  Widget _buildMonthGrid(EventsProvider p) {
    final t = CupertinoTheme.of(context);
    final l = context.l10n;
    final today = DateTime.now();
    final first = DateTime(p.weekStart.year, p.weekStart.month, 1);
    final last = DateTime(p.weekStart.year, p.weekStart.month + 1, 0);
    final off = first.weekday - 1;
    final days = last.day;
    final rows = ((days + off + 6) ~/ 7);
    final wd = l.isZh ? ['一','二','三','四','五','六','日'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    return Container(
      color: CupertinoColors.systemBackground.resolveFrom(context),
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(children: wd.map((d) => Expanded(child: Center(child: Text(d, style: TextStyle(fontSize:12, fontWeight:FontWeight.w600, color:CupertinoColors.systemGrey.resolveFrom(context)))))).toList()),
        const SizedBox(height:4),
        ...List.generate(rows, (wi) {
          return Row(children: List.generate(7, (di) {
            final day = wi * 7 + di - off + 1;
            final inM = day >= 1 && day <= days;
            final date = inM ? DateTime(first.year, first.month, day) : null;
            final sel = date != null && _sameDay(date, p.selectedDate);
            final isT = date != null && _sameDay(date, today);
            final has = date != null && (p.eventsByDate[_norm(date)]?.isNotEmpty ?? false);
            return Expanded(child: GestureDetector(
              onDoubleTap: () { if (date != null) context.push('/events/create'); },
              onTap: () {
              if (date != null) {
                p.selectDate(date);
                setState(() => _dayFiltered = p.viewMode != CalendarViewMode.day);
              }
            },
              child: Container(height:36, alignment:Alignment.center, child: Container(width:32, height:32,
                decoration: BoxDecoration(
                  color: sel ? t.primaryColor : (isT ? (t.primaryColor ?? CupertinoColors.systemBlue).withAlpha(25) : null),
                  shape: BoxShape.circle),
                child: Stack(alignment:Alignment.center, children: [
                  Text(inM ? '$day' : '', style: TextStyle(fontSize:14,
                    fontWeight: sel || isT ? FontWeight.w700 : FontWeight.w400,
                    color: !inM ? CupertinoColors.systemGrey.resolveFrom(context).withAlpha(60)
                        : sel ? CupertinoColors.white
                        : isT ? (t.primaryColor ?? CupertinoColors.systemBlue)
                        : t.textTheme.textStyle.color)),
                  if(has) Positioned(bottom:2, child: Container(width:4, height:4,
                    decoration: BoxDecoration(color: sel ? CupertinoColors.white : (t.primaryColor ?? CupertinoColors.systemBlue), shape:BoxShape.circle))),
                ])),
            )));
          }));
        }),
      ]),
    );
  }

  // ═══════════════ 日期条 ═══════════════

  Widget _buildDateStrip(EventsProvider p) {
    final t = CupertinoTheme.of(context);
    final wd = context.l10n.isZh ? ['一','二','三','四','五','六','日'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return Container(
      color: CupertinoColors.systemBackground.resolveFrom(context),
      padding: const EdgeInsets.only(bottom:6, top:4),
      child: SizedBox(height:62, child: ListView.builder(
        scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal:8),
        physics: const BouncingScrollPhysics(), itemCount: 7,
        itemBuilder: (_, i) {
          final date = p.weekStart.add(Duration(days:i));
          final sel = _sameDay(date, p.selectedDate);
          final isT = _sameDay(date, DateTime.now());
          final has = p.eventsByDate[_norm(date)]?.isNotEmpty ?? false;
          return GestureDetector(
            onDoubleTap: () => context.push('/events/create'),
            onTap: () {
                p.selectDate(date);
                setState(() => _dayFiltered = p.viewMode != CalendarViewMode.day);
              },
            child: Container(width:52, margin:const EdgeInsets.symmetric(horizontal:3),
              decoration: BoxDecoration(color:sel?t.primaryColor:null, borderRadius:BorderRadius.circular(12)),
              child: Column(mainAxisAlignment:MainAxisAlignment.center, children: [
                Text(wd[i], style:TextStyle(fontSize:12, color:sel?CupertinoColors.white:isT?(t.primaryColor ?? CupertinoColors.systemBlue):CupertinoColors.systemGrey.resolveFrom(context))),
                const SizedBox(height:2),
                Text('${date.day}', style:TextStyle(fontSize:18, fontWeight:FontWeight.w600, color:sel?CupertinoColors.white:t.textTheme.textStyle.color)),
                has ? Container(width:5, height:5, margin:const EdgeInsets.only(top:1),
                  decoration:BoxDecoration(color:sel?CupertinoColors.white:(t.primaryColor ?? CupertinoColors.systemBlue), shape:BoxShape.circle))
                    : const SizedBox(height:6),
              ]),
            ),
          );
        },
      )),
    );
  }

  // ═══════════════ 内容主体 ═══════════════

  Widget _buildBody(EventsProvider p) {
    if (p.loading && p.mode == EventsMode.calendar) return const LoadingWidget();
    if (p.error != null && p.mode == EventsMode.calendar && p.eventsByDate.isEmpty) {
      return AppErrorView(message: p.error!, onRetry: () => p.loadCalendar());
    }
    if (p.mode == EventsMode.search || p.mode == EventsMode.all) {
      return _buildPagedList(p);
    }
    switch (p.viewMode) {
      case CalendarViewMode.day: return _buildDayView(p);
      case CalendarViewMode.week: return _buildWeekView(p);
      case CalendarViewMode.month: return _buildMonthListView(p);
    }
  }

  // ═══════════════ 日视图：Teams 时间轴 ═══════════════

  static const double _hourH = 60.0;

  Widget _buildDayView(EventsProvider p) {
    final l = context.l10n;
    final items = p.currentDayEvents;
    if (items.isEmpty && !p.loading) return AppEmptyView(message: l.noEventsForDate);
    final sorted = List<EventModel>.from(items)..sort((a,b) => a.startTime.compareTo(b.startTime));
    final firstEventHour = sorted.isNotEmpty ? sorted.first.startTime.toLocal().hour : 8;

    // Auto-scroll to first event after build
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final scrollPos = firstEventHour * _hourH - 30; // 30px padding at top
      if (_scrollCtrl.hasClients && scrollPos > 0) {
        _scrollCtrl.animateTo(scrollPos > _scrollCtrl.position.maxScrollExtent ? _scrollCtrl.position.maxScrollExtent : scrollPos,
          duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });

    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
        child: Row(children: [
          Text(DateFormat(l.isZh ? 'M月d日 EEEE' : 'EEEE, MMM d').format(p.selectedDate),
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: CupertinoColors.label.resolveFrom(context))),
          const Spacer(),
          Text(l.eventsCount(items.length), style: TextStyle(fontSize: 13, color: CupertinoColors.systemGrey.resolveFrom(context))),
        ]),
      ),
      Expanded(child: _buildTimelineDay(sorted)),
    ]);
  }

  Widget _buildTimelineDay(List<EventModel> items) {
    final t = CupertinoTheme.of(context);
    final totalHeight = 24 * _hourH;

    // 重叠布局算法：为每个事件分配列号 (greedy column packing)
    final sorted = List<EventModel>.from(items)
      ..sort((a, b) => a.startTime.compareTo(b.startTime));
    final Map<int, int> eventCol = {};
    final cols = <double>[];
    for (final e in sorted) {
      final s = e.startTime.toLocal().millisecondsSinceEpoch.toDouble();
      final end = e.endTime.toLocal().millisecondsSinceEpoch.toDouble();
      int c = 0;
      while (c < cols.length && cols[c] > s) c++;
      if (c >= cols.length) cols.add(end); else cols[c] = end;
      eventCol[e.id] = c;
    }
    final int totalCols = cols.isEmpty ? 1 : cols.length;

    return CupertinoScrollbar(
      controller: _scrollCtrl,
      child: LayoutBuilder(
        builder: (ctx, constraints) {
          final totalW = constraints.maxWidth;
          final eventAreaW = totalW - 66.0; // 58 left + 8 right
          final colW = eventAreaW / totalCols;
          return SingleChildScrollView(
            controller: _scrollCtrl,
            physics: const AlwaysScrollableScrollPhysics(),
            child: SizedBox(
              height: totalHeight,
              child: Stack(
                children: [
                  // Hour lines + labels
                  ...List.generate(24, (hour) {
                    return Positioned(
                      top: hour * _hourH, left: 0, right: 0,
                      child: SizedBox(
                        height: _hourH,
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          SizedBox(width: 52, child: Padding(
                            padding: const EdgeInsets.only(top: 0),
                            child: Text('${hour.toString().padLeft(2,'0')}:00',
                              textAlign: TextAlign.right,
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: CupertinoColors.systemGrey.resolveFrom(context))),
                          )),
                          Expanded(child: Container(height: 0.5, color: CupertinoColors.separator.resolveFrom(context).withAlpha(40))),
                        ]),
                      ),
                    );
                  }),
                  // Events (overlap-aware layout)
                  ...sorted.map((e) {
                    final c = eventCol[e.id] ?? 0;
                    final localStart = e.startTime.toLocal();
                    final localEnd = e.endTime.toLocal();
                    final topMin = localStart.hour * 60.0 + localStart.minute;
                    final top = (topMin / 60.0) * _hourH;
                    final h = (localEnd.difference(localStart).inMinutes / 60.0) * _hourH;
                    final safeH = h < 20 ? 20.0 : h;
                    final evColor = _color(e.colorRole);
                    final left = 58.0 + c * colW;

                    return Positioned(
                      top: top, left: left + 1, width: colW - 4, height: safeH,
                      child: GestureDetector(
                        onTap: () => context.push('/events/${e.id}/edit'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                          decoration: BoxDecoration(
                            color: evColor.withAlpha(25),
                            borderRadius: BorderRadius.circular(4),
                            border: Border(left: BorderSide(color: evColor, width: 3)),
                          ),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                            if (safeH > 24) Text(e.title.isNotEmpty ? e.title : '(No Title)',
                              style: TextStyle(fontSize: safeH > 30 ? 13 : 11, fontWeight: FontWeight.w600, color: t.textTheme.textStyle.color),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                            if (safeH > 24 && e.location != null)
                              Text(e.location!, style: TextStyle(fontSize: 10, color: CupertinoColors.systemGrey.resolveFrom(context)), maxLines: 1, overflow: TextOverflow.ellipsis),
                          ]),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ═══════════════ 周视图：Teams 风格 ═══════════════

  /// 获取当前视图要显示的分段（全范围 或 仅选中日期）
  List<_SectionItem> _getViewSections(EventsProvider p, bool isWeek) {
    final sections = <_SectionItem>[];
    final range = isWeek ? 7 : 31;
    final today = DateTime.now();
    for (var i = 0; i < range; i++) {
      DateTime date;
      if (isWeek) {
        date = _norm(p.weekStart.add(Duration(days: i)));
      } else {
        date = DateTime(p.weekStart.year, p.weekStart.month, i + 1);
        if (date.month != p.weekStart.month) break;
      }
      // 如果开启了日期过滤，只显示选中日期
      if (_dayFiltered && !_sameDay(date, p.selectedDate)) continue;
      final evts = p.eventsByDate[date];
      if (evts != null && evts.isNotEmpty) {
        sections.add(_SectionItem(date: date, isHeader: true));
        final sorted = List<EventModel>.from(evts)..sort((a, b) => a.startTime.compareTo(b.startTime));
        sections.addAll(sorted.map((e) => _SectionItem(event: e)));
      }
    }
    return sections;
  }

  int _weekScrollToIndex = -1;

  Widget _buildWeekView(EventsProvider p) {
    final l = context.l10n;
    final sections = _getViewSections(p, true);

    if (sections.isEmpty) return AppEmptyView(message: l.noEventsForDate);

    // Scroll to selected date when it changes
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      int target = -1;
      for (int i = 0; i < sections.length; i++) {
        if (sections[i].isHeader && sections[i].date != null && _sameDay(sections[i].date!, p.selectedDate)) {
          target = i;
          break;
        }
      }
      if (target > 0) {
        double offset = 0;
        for (int i = 0; i < target; i++) {
          offset += sections[i].isHeader ? 44.0 : 56.0;
        }
        final max = _scrollCtrl.position.maxScrollExtent;
        if (offset > max && max > 0) offset = max;
        if ((_scrollCtrl.position.pixels - offset).abs() > 20) {
          _scrollCtrl.animateTo(offset, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
        }
      }
    });

    return CupertinoScrollbar(controller: _scrollCtrl, child: CustomScrollView(
      controller: _scrollCtrl, physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        CupertinoSliverRefreshControl(onRefresh: () => p.refresh()),
        SliverList(delegate: SliverChildBuilderDelegate((ctx, i) {
          final item = sections[i];
          if (item.isHeader) {
            final wd = l.isZh ? ['周一','周二','周三','周四','周五','周六','周日'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
            final idx = item.date!.weekday - 1;
            final label = l.isZh
                ? '${item.date!.month}月${item.date!.day}日 ${wd[idx]}'
                : '${DateFormat("MMM d").format(item.date!)} ${wd[idx]}';
            final isToday = _sameDay(item.date!, DateTime.now());
            final cnt = p.eventsByDate[_norm(item.date!)]?.length ?? 0;
            return GestureDetector(
              onTap: () {
                p.selectDate(item.date!);
                p.setViewMode(CalendarViewMode.day);
              },
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Row(children: [
                  Container(width:4, height:16, margin:const EdgeInsets.only(right:8),
                    decoration: BoxDecoration(color:isToday?(CupertinoTheme.of(context).primaryColor ?? CupertinoColors.systemBlue):CupertinoColors.systemGrey, borderRadius:BorderRadius.circular(2))),
                  Text(label, style:TextStyle(fontSize:14, fontWeight:FontWeight.w700,
                    color:isToday?(CupertinoTheme.of(context).primaryColor ?? CupertinoColors.systemBlue):CupertinoColors.label.resolveFrom(context))),
                  const Spacer(),
                  Text('$cnt', style:TextStyle(fontSize:12, color:CupertinoColors.systemGrey.resolveFrom(context))),
                ]),
              ),
            );
          }
          return _buildWeekEventCard(item.event!);
        }, childCount: sections.length)),
      ],
    ));
  }

  Widget _buildWeekEventCard(EventModel e) {
    final t = CupertinoTheme.of(context);
    final c = _color(e.colorRole);
    final s = e.startTime.toLocal().toString().substring(11, 16);
    final en = e.endTime.toLocal().toString().substring(11, 16);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 52, child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(s, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: t.textTheme.textStyle.color)),
          Text(en, style: TextStyle(fontSize: 11, color: CupertinoColors.systemGrey.resolveFrom(context))),
        ])),
        SizedBox(width: 24, child: Column(children: [
          Container(width: 6, height: 6, margin: const EdgeInsets.only(top: 5), decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          Container(width: 2, height: 20, color: c.withAlpha(50)),
        ])),
        Expanded(child: GestureDetector(
          onTap: () => context.push('/events/${e.id}/edit'),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: CupertinoColors.systemBackground.resolveFrom(context),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: CupertinoColors.separator.resolveFrom(context).withAlpha(60)),
            ),
            child: Row(children: [
              Container(width: 3, height: 32, margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(e.title.isNotEmpty ? e.title : '(No Title)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.textTheme.textStyle.color), maxLines: 1, overflow: TextOverflow.ellipsis),
                Text('$s - $en', style: TextStyle(fontSize: 11, color: CupertinoColors.systemGrey.resolveFrom(context))),
              ])),
              CupertinoButton(padding: const EdgeInsets.all(4), minSize: 28,
                child: Icon(CupertinoIcons.ellipsis, size: 14, color: CupertinoColors.systemGrey),
                onPressed: () => _actions(e)),
            ]),
          ),
        )),
      ]),
    );
  }

  // ═══════════════ 分页列表（搜索/全部） ═══════════════

  
  // ═══════════════ 月视图：整月事件按日期分组列表 ═══════════════

  Widget _buildMonthListView(EventsProvider p) {
    final l = context.l10n;
    final sections = _getViewSections(p, false);

    return CupertinoScrollbar(controller: _scrollCtrl, child: CustomScrollView(
      controller: _scrollCtrl, physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        CupertinoSliverRefreshControl(onRefresh: () => p.refresh()),
        SliverList(delegate: SliverChildBuilderDelegate((ctx, i) {
          final item = sections[i];
          if (item.isHeader) {
            final wd = l.isZh ? ['周一','周二','周三','周四','周五','周六','周日'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
            final idx = item.date!.weekday - 1;
            final label = l.isZh
                ? '${item.date!.month}月${item.date!.day}日 ${wd[idx]}'
                : '${DateFormat("MMM d").format(item.date!)} ${wd[idx]}';
            final isToday = _sameDay(item.date!, DateTime.now());
            final cnt = p.eventsByDate[_norm(item.date!)]?.length ?? 0;
            return GestureDetector(
              onTap: () {
                p.selectDate(item.date!);
                p.setViewMode(CalendarViewMode.day);
              },
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Row(children: [
                  Container(width:4, height:16, margin:const EdgeInsets.only(right:8),
                    decoration: BoxDecoration(color:isToday?(CupertinoTheme.of(context).primaryColor ?? CupertinoColors.systemBlue):CupertinoColors.systemGrey, borderRadius:BorderRadius.circular(2))),
                  Text(label, style:TextStyle(fontSize:14, fontWeight:FontWeight.w700,
                    color:isToday?(CupertinoTheme.of(context).primaryColor ?? CupertinoColors.systemBlue):CupertinoColors.label.resolveFrom(context))),
                  const Spacer(),
                  Text('$cnt', style:TextStyle(fontSize:12, color:CupertinoColors.systemGrey.resolveFrom(context))),
                ]),
              ),
            );
          }
          return _buildWeekEventCard(item.event!);
        }, childCount: sections.length)),
      ],
    ));
  }
  Widget _buildPagedList(EventsProvider p) {
    final l = context.l10n;
    final items = p.allEvents;
    final loadingMore = p.loadingMore;
    if (items.isEmpty && !p.loading) return AppEmptyView(message: l.noEvents);
    return Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(16,8,16,4), child: Row(children: [
        Text(p.mode == EventsMode.search ? '${l.searchResults} (${p.total})' : l.eventsCount(p.total),
          style: TextStyle(fontSize:13, fontWeight:FontWeight.w600, color:CupertinoColors.systemGrey.resolveFrom(context))),
      ])),
      Expanded(child: _buildPagedTimeline(items, loadingMore, p.hasMore, l, p)),
    ]);
  }

  Widget _buildPagedTimeline(List<EventModel> items, bool loadingMore, bool hasMore, AppLocalizations l, EventsProvider p) {
    // 构建带日期标头+事件的分段列表
    final sections = <_SectionItem>[];
    DateTime? lastDate;
    for (final event in items) {
      final d = _norm(event.startTime.toLocal());
      if (lastDate == null || !_sameDay(d, lastDate)) {
        sections.add(_SectionItem(date: d, isHeader: true));
        lastDate = d;
      }
      sections.add(_SectionItem(event: event));
    }

    return CupertinoScrollbar(controller: _scrollCtrl, child: CustomScrollView(
      controller: _scrollCtrl, physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        CupertinoSliverRefreshControl(onRefresh: () => p.refresh()),
        SliverList(delegate: SliverChildBuilderDelegate((ctx, i) {
          if (i == sections.length) {
            if (loadingMore) return const Padding(padding:EdgeInsets.all(16), child:Center(child:CupertinoActivityIndicator()));
            if (hasMore) return Padding(padding:const EdgeInsets.all(16), child:Center(child:GestureDetector(
              onTap: () => p.mode == EventsMode.all ? p.loadMoreAll() : p.loadMore(),
              child: Text(l.loadMore, style:TextStyle(fontSize:13, color:CupertinoColors.systemGrey.resolveFrom(context))))));
            if (!hasMore && items.isNotEmpty)
              return Padding(padding:const EdgeInsets.all(16), child:Center(child:Text(l.noMoreEvents, style:TextStyle(fontSize:13, color:CupertinoColors.systemGrey.resolveFrom(context)))));
            return const SizedBox.shrink();
          }
          final item = sections[i];
          if (item.isHeader) {
            final wd = l.isZh ? ['周一','周二','周三','周四','周五','周六','周日'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
            final idx = item.date!.weekday - 1;
            final label = l.isZh
                ? '${item.date!.month}月${item.date!.day}日 ${wd[idx]}'
                : '${DateFormat("MMM d").format(item.date!)} ${wd[idx]}';
            final isToday = _sameDay(item.date!, DateTime.now());
            return GestureDetector(
              onTap: () {
                p.selectDate(item.date!);
                p.setViewMode(CalendarViewMode.day);
              },
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Row(children: [
                  Container(width:4, height:16, margin:const EdgeInsets.only(right:8),
                    decoration: BoxDecoration(color:isToday?(CupertinoTheme.of(context).primaryColor ?? CupertinoColors.systemBlue):CupertinoColors.systemGrey, borderRadius:BorderRadius.circular(2))),
                  Text(label, style:TextStyle(fontSize:14, fontWeight:FontWeight.w700,
                    color:isToday?(CupertinoTheme.of(context).primaryColor ?? CupertinoColors.systemBlue):CupertinoColors.label.resolveFrom(context))),
                ]),
              ),
            );
          }
          return _buildCard(item.event!);
        }, childCount: sections.length + (items.isNotEmpty ? 1 : 0))),
      ],
    ));
  }

  Widget _buildCard(EventModel e) {
    final t = CupertinoTheme.of(context);
    final c = _color(e.colorRole);
    final s = e.startTime.toLocal().toString().substring(11,16);
    final en = e.endTime.toLocal().toString().substring(11,16);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal:16, vertical:3),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width:52, child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(s, style:TextStyle(fontSize:14, fontWeight:FontWeight.w600, color:t.textTheme.textStyle.color)),
          Text(en, style:TextStyle(fontSize:11, color:CupertinoColors.systemGrey.resolveFrom(context))),
        ])),
        SizedBox(width:28, child: Column(children: [
          Container(width:8, height:8, margin:const EdgeInsets.only(top:4), decoration:BoxDecoration(color:c, shape:BoxShape.circle)),
          Container(width:2, height:20, color:c.withAlpha(50)),
        ])),
        Expanded(child: GestureDetector(
          onTap: () => context.push('/events/${e.id}/edit'),
          child: Container(
            decoration: BoxDecoration(color:CupertinoColors.systemBackground.resolveFrom(context), borderRadius:BorderRadius.circular(10),
              border:Border.all(color:CupertinoColors.separator.resolveFrom(context).withAlpha(80))),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width:4, height:60, decoration:BoxDecoration(color:c, borderRadius:const BorderRadius.only(topLeft:Radius.circular(10), bottomLeft:Radius.circular(10)))),
              Expanded(child: Padding(padding:const EdgeInsets.symmetric(horizontal:12,vertical:10), child:Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(e.title.isNotEmpty ? e.title : '(No Title)', style:TextStyle(fontSize:15, fontWeight:FontWeight.w600, color:t.textTheme.textStyle.color), maxLines:1, overflow:TextOverflow.ellipsis),
                if (e.location != null || (e.description != null && e.description!.isNotEmpty)) ...[
                  const SizedBox(height:3),
                  Text([e.location, e.description].where((s) => s != null && s.isNotEmpty).join(' · '),
                    style:TextStyle(fontSize:13, color:CupertinoColors.systemGrey.resolveFrom(context)), maxLines:2, overflow:TextOverflow.ellipsis),
                ],
              ]))),
              Padding(padding:const EdgeInsets.only(top:8), child:CupertinoButton(padding:const EdgeInsets.all(4), minSize:32,
                child:Icon(CupertinoIcons.ellipsis, size:16, color:CupertinoColors.systemGrey), onPressed:()=>_actions(e))),
            ]),
          ),
        )),
      ]),
    );
  }

  // ═══════════════ 操作 ═══════════════

  void _actions(EventModel e) {
    final l = context.l10n;
    showCupertinoModalPopup(context:context, builder:(ctx)=>CupertinoActionSheet(actions:[
      CupertinoActionSheetAction(onPressed:(){Navigator.pop(ctx); context.push('/events/${e.id}/edit');}, child:Text(l.edit)),
      CupertinoActionSheetAction(isDestructiveAction:true, onPressed:(){Navigator.pop(ctx); _delete(e);}, child:Text(l.delete)),
    ], cancelButton:CupertinoActionSheetAction(onPressed:()=>Navigator.pop(ctx), child:Text(l.cancel, style:const TextStyle(fontWeight:FontWeight.w600)))));
  }

  Future<void> _delete(EventModel e) async {
    final l = context.l10n;
    final ok = await showCupertinoDialog<bool>(context:context, builder:(ctx)=>CupertinoAlertDialog(
      title:Text(l.delete), content:Text(l.deleteConfirm),
      actions:[CupertinoDialogAction(isDestructiveAction:false, onPressed:()=>Navigator.pop(ctx,false), child:Text(l.cancel)),
               CupertinoDialogAction(isDestructiveAction:true, onPressed:()=>Navigator.pop(ctx,true), child:Text(l.delete))]));
    if (ok==true && mounted) {
      final r = await context.read<EventsProvider>().delete(e.id);
      if (mounted) AppToast.show(context, r ? l.eventDeleted : l.unknownError);
    }
  }

  // ═══════════════ 日期选择器 ═══════════════

  void _datePicker(bool isStart) {
    final initial = isStart ? (_srchStart ?? DateTime.now()) : (_srchEnd ?? DateTime.now().add(const Duration(days:7)));
    DateTime? picked;
    showCupertinoModalPopup(context:context, builder:(ctx) {
      DateTime local = initial;
      return Container(height:260,
        decoration: BoxDecoration(color:CupertinoTheme.brightnessOf(context)==Brightness.dark ? const Color(0xFF1C1C1E) : CupertinoColors.systemBackground.resolveFrom(context),
          borderRadius: const BorderRadius.vertical(top:Radius.circular(14))),
        child: Column(children:[
          Container(height:44, color:CupertinoTheme.of(context).barBackgroundColor,
            child:Row(mainAxisAlignment:MainAxisAlignment.spaceBetween, children:[
              CupertinoButton(child:const Text('Cancel'), onPressed:()=>Navigator.pop(ctx)),
              CupertinoButton(child:const Text('Done'), onPressed:(){picked=local; Navigator.pop(ctx);})])),
          Expanded(child:CupertinoDatePicker(initialDateTime:initial, mode:CupertinoDatePickerMode.date, onDateTimeChanged:(v){local=v;})),
        ]));
    }).then((_){
      if(picked!=null && mounted) setState((){ if(isStart) _srchStart=picked; else _srchEnd=picked; });
    });
  }

  // ═══════════════ 工具 ═══════════════

  bool _sameDay(DateTime a, DateTime b) => a.year==b.year && a.month==b.month && a.day==b.day;
  bool _sameWeek(DateTime ws, DateTime o) { final os=_norm(o).subtract(Duration(days:o.weekday-1)); return _sameDay(ws,os); }
  DateTime _norm(DateTime d) => DateTime(d.year,d.month,d.day);
}

class _SectionItem {
  final DateTime? date;
  final bool isHeader;
  final EventModel? event;
  _SectionItem({this.date, this.isHeader = false, this.event});
}

