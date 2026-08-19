import 'package:flutter/foundation.dart';
import '../../data/models/event_model.dart';
import '../../data/repositories/events_repository.dart';

enum CalendarViewMode { day, week, month }
enum EventsMode { calendar, search, all }

class EventsProvider extends ChangeNotifier {
  final EventsRepository _repository;

  DateTime _selectedDate = DateTime.now();
  DateTime _weekStart = DateTime.now();
  CalendarViewMode _viewMode = CalendarViewMode.day;
  final Map<DateTime, List<EventModel>> _eventsByDate = {};
  List<EventModel> _currentDayEvents = [];

  String _searchKeyword = '';
  DateTime? _searchStart;
  DateTime? _searchEnd;

  List<EventModel> _pagedEvents = [];
  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  bool _hasMore = false;

  bool _loading = false;
  bool _loadingMore = false;
  String? _error;
  EventsMode _mode = EventsMode.calendar;
  bool _disposed = false;

  /// 日历加载代数：快速翻周/翻月时丢弃过期响应，避免乱序覆盖。
  int _weekGeneration = 0;
  /// 分页加载代数：搜索/全部模式切换时丢弃过期响应，避免串模式追加。
  int _loadGeneration = 0;

  EventsProvider(this._repository) { _initToday(); }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  DateTime get selectedDate => _selectedDate;
  DateTime get weekStart => _weekStart;
  CalendarViewMode get viewMode => _viewMode;
  Map<DateTime, List<EventModel>> get eventsByDate => _eventsByDate;
  List<EventModel> get currentDayEvents => _currentDayEvents;
  List<EventModel> get weekEvents {
    final r = <EventModel>[];
    for (var i = 0; i < 7; i++) {
      final evts = _eventsByDate[_key(DateTime(_weekStart.year, _weekStart.month, _weekStart.day + i))];
      if (evts != null) r.addAll(evts);
    }
    return r;
  }
  List<EventModel> get events => _pagedEvents;
  List<EventModel> get allEvents => _pagedEvents;
  String get searchKeyword => _searchKeyword;
  DateTime? get searchStart => _searchStart;
  DateTime? get searchEnd => _searchEnd;
  int get total => _total;
  bool get hasMore => _hasMore;
  bool get loading => _loading;
  bool get loadingMore => _loadingMore;
  String? get error => _error;
  EventsMode get mode => _mode;

  /// 统一日期约化 key：所有日期都用本地午夜 DateTime
  static DateTime _key(DateTime d) => DateTime(d.year, d.month, d.day);

  static DateTime _mondayOf(DateTime d) {
    final dt = _key(d);
    return dt.subtract(Duration(days: dt.weekday - 1));
  }

  void _initToday() {
    final now = DateTime.now();
    _selectedDate = _key(now);
    _weekStart = _mondayOf(now);
  }

  void setViewMode(CalendarViewMode mode) { _viewMode = mode; if (_mode != EventsMode.calendar) { _mode = EventsMode.calendar; _error = null; } _notify(); }

  void selectDate(DateTime date) {
    _selectedDate = _key(date);
    _mode = EventsMode.calendar;
    _error = null;
    _currentDayEvents = _eventsByDate[_selectedDate] ?? [];
    _notify();
  }

  void prevWeek() { _weekStart = _weekStart.subtract(const Duration(days: 7)); _loadWeek(); }
  void nextWeek() { _weekStart = _weekStart.add(const Duration(days: 7)); _loadWeek(); }
  void prevMonth() { _weekStart = _key(DateTime(_weekStart.year, _weekStart.month - 1, 1)); _loadWeek(); }
  void nextMonth() { _weekStart = _key(DateTime(_weekStart.year, _weekStart.month + 1, 1)); _loadWeek(); }

  void goToday() {
    final now = DateTime.now();
    _weekStart = _mondayOf(now);
    _selectedDate = _key(now);
    _loadWeek();
  }

  Future<void> _loadWeek({bool silent = false}) async {
    final generation = ++_weekGeneration;
    if (!silent) {
      _loading = true;
      _error = null;
      _notify();
    }

    try {
      // 加载整月数据（前后各加7天缓冲），确保日/周/月视图都能覆盖
      final monthFirst = DateTime(_weekStart.year, _weekStart.month, 1);
      final monthLast = DateTime(_weekStart.year, _weekStart.month + 1, 0);
      final rangeStart = monthFirst.subtract(const Duration(days: 7));
      final rangeEnd = monthLast.add(const Duration(days: 7));
      final fmt = (DateTime d) =>
          '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

      final events = await _repository.getEvents(fmt(rangeStart), fmt(rangeEnd));
      if (generation != _weekGeneration) return; // 过期响应，丢弃

      _eventsByDate.clear();
      for (final e in events) {
        final evStart = e.startTime.toLocal();
        final evEnd = e.endTime.toLocal();
        // 跨天事件：在每一天都显示（用 _key 归一化，避免跨 DST 时间漂移）
        var d = _key(evStart);
        final last = _key(evEnd);
        while (true) {
          _eventsByDate.putIfAbsent(d, () => []).add(e);
          if (d == last) break;
          // 日历加法而非 +24h：DST 回拨日（25 小时）用 add 会回到当日 23:00 致死循环
          d = _key(DateTime(d.year, d.month, d.day + 1));
        }
      }
      _currentDayEvents = _eventsByDate[_selectedDate] ?? [];
    } catch (e) {
      if (generation != _weekGeneration) return;
      _error = e.toString();
    }

    if (generation != _weekGeneration) return;
    _loading = false;
    _notify();
  }

  Future<void> loadCalendar() async => _loadWeek();

  void setKeyword(String kw) => _searchKeyword = kw;
  void setDateRange(DateTime? s, DateTime? e) { _searchStart = s; _searchEnd = e; }

  Future<void> search({bool reload = true}) async {
    final generation = ++_loadGeneration;
    _mode = EventsMode.search; _error = null;
    if (reload) { _page = 1; _pagedEvents = []; _loading = true; } else { _loadingMore = true; }
    _notify();
    try {
      final fmt = (DateTime d) =>
          '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      final requestedPage = _page;
      final r = await _repository.searchEvents(
        keyword: _searchKeyword.isNotEmpty ? _searchKeyword : null,
        start: _searchStart != null ? fmt(_searchStart!) : null,
        end: _searchEnd != null ? fmt(_searchEnd!) : null,
        page: requestedPage, limit: 20,
      );
      if (generation != _loadGeneration) return; // 过期响应，丢弃
      final items = (r['items'] as List?)
          ?.map((e) => EventModel.fromJson(e as Map<String, dynamic>))
          .toList() ?? [];
      _total = r['total'] as int? ?? 0;
      _totalPages = r['totalPages'] as int? ?? 1;
      _hasMore = requestedPage < _totalPages;
      if (reload) { _pagedEvents = items; } else { _pagedEvents.addAll(items); }
      _page = requestedPage + 1; // 仅在成功后推进页码
    } catch (e) {
      if (generation != _loadGeneration) return;
      _error = e.toString();
    }
    if (generation != _loadGeneration) return;
    _loading = false; _loadingMore = false;
    _notify();
  }

  Future<void> loadMore() async {
    if (_loadingMore || !_hasMore || _mode != EventsMode.search) return;
    await search(reload: false);
  }

  Future<void> loadAll({bool reload = true}) async {
    final generation = ++_loadGeneration;
    _mode = EventsMode.all; _error = null;
    if (reload) { _page = 1; _pagedEvents = []; _loading = true; } else { _loadingMore = true; }
    _notify();
    try {
      final requestedPage = _page;
      final r = await _repository.searchEvents(page: requestedPage, limit: 20);
      if (generation != _loadGeneration) return; // 过期响应，丢弃
      final items = (r['items'] as List?)
          ?.map((e) => EventModel.fromJson(e as Map<String, dynamic>))
          .toList() ?? [];
      _total = r['total'] as int? ?? 0;
      _totalPages = r['totalPages'] as int? ?? 1;
      _hasMore = requestedPage < _totalPages;
      if (reload) { _pagedEvents = items; } else { _pagedEvents.addAll(items); }
      _page = requestedPage + 1; // 仅在成功后推进页码
    } catch (e) {
      if (generation != _loadGeneration) return;
      _error = e.toString();
    }
    if (generation != _loadGeneration) return;
    _loading = false; _loadingMore = false;
    _notify();
  }

  Future<void> loadMoreAll() async {
    if (_loadingMore || !_hasMore || _mode != EventsMode.all) return;
    await loadAll(reload: false);
  }

  Future<bool> create(Map<String, dynamic> data) async {
    try {
      final created = await _repository.createEvent(data);
      _selectedDate = _key(created.startTime.toLocal());
      _weekStart = _mondayOf(created.startTime.toLocal());
      _mode = EventsMode.calendar;
      _error = null;

      // 直接添加事件到本地缓存，跨天事件处理
      var d = _key(created.startTime.toLocal());
      final last = _key(created.endTime.toLocal());
      while (true) {
        _eventsByDate.putIfAbsent(d, () => []).add(created);
        if (d == last) break;
        d = _key(d.add(const Duration(days: 1)));
      }
      _currentDayEvents = _eventsByDate[_selectedDate] ?? [];
      _notify();

      // 后台静默刷新以同步服务端完整数据
      _loadWeek(silent: true);
      return true;
    } catch (e) {
      _error = e.toString();
      _notify();
      return false;
    }
  }

  Future<bool> update(int id, Map<String, dynamic> data) async {
    try { await _repository.updateEvent(id, data); await _refresh(); return true; }
    catch (e) { _error = e.toString(); _notify(); return false; }
  }

  Future<bool> delete(int id) async {
    try { await _repository.deleteEvent(id); await _refresh(); return true; }
    catch (e) { _error = e.toString(); _notify(); return false; }
  }

  Future<void> _refresh() async {
    switch (_mode) {
      case EventsMode.calendar:
        await _loadWeek();
        break;
      case EventsMode.search:
        await search(reload: true);
        // 同时刷新日历缓存，保证切回日历视图数据一致
        await _loadWeek(silent: true);
        break;
      case EventsMode.all:
        await loadAll(reload: true);
        await _loadWeek(silent: true);
        break;
    }
  }

  Future<void> refresh() async => _refresh();
}
