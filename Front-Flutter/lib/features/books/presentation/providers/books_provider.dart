import 'package:flutter/foundation.dart';
import '../../../../core/services/app_cache.dart';
import '../../data/models/book_model.dart';
import '../../data/repositories/books_repository.dart';

/// 图书状态管理（UX-1：缓存优先 + 乐观更新）。
class BooksProvider extends ChangeNotifier {
  final BooksRepository _repository;
  final AppCache _cache;

  static const _ns = 'books';
  static const _keyList = 'list';

  List<BookModel> _items = [];
  bool _loading = false;
  bool _fromCache = false;
  String? _error;
  bool _disposed = false;
  int _loadGeneration = 0;

  BooksProvider(this._repository, {AppCache? cache})
      : _cache = cache ?? AppCache.unavailable();

  List<BookModel> get items => List.unmodifiable(_items);
  bool get loading => _loading;
  String? get error => _error;
  /// 当前数据是否来自离线缓存（网络未刷新成功）。
  bool get fromCache => _fromCache;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    final generation = ++_loadGeneration;
    _loading = true;
    _error = null;
    _notify();

    // 缓存优先：先展示本地缓存，避免空白。缓存读取失败不阻塞网络刷新。
    try {
      final cached = await _cache.readList(_ns, _keyList);
      if (generation != _loadGeneration) return;
      if (cached != null) {
        _items = cached.map(BookModel.fromJson).toList();
        _fromCache = true;
        _notify();
      }
    } catch (e) {
      if (generation != _loadGeneration) return;
      debugPrint('BooksProvider cache read failed: $e');
    }

    try {
      final books = await _repository.getBooks();
      if (generation != _loadGeneration) return;
      _items = books;
      _fromCache = false;
      try {
        await _cache.writeList(_ns, _keyList, _items.map((e) => e.toJson()).toList());
      } catch (e) {
        // 网络加载已成功，缓存写入失败不应视为加载失败。
        debugPrint('BooksProvider cache write failed: $e');
      }
    } catch (e) {
      if (generation != _loadGeneration) return;
      if (_items.isEmpty) _error = e.toString();
    } finally {
      if (generation == _loadGeneration) {
        _loading = false;
        _notify();
      }
    }
  }

  Future<bool> add(Map<String, dynamic> data) async {
    try {
      final item = await _repository.create(data);
      _items = [..._items, item];
      _error = null;
      _notify();
      try {
        await _persist();
      } catch (e) {
        // 网络创建已成功，缓存写入失败不应视为操作失败。
        debugPrint('BooksProvider cache write failed: $e');
      }
      return true;
    } catch (e) {
      _error = e.toString();
      _notify();
      return false;
    }
  }

  /// 乐观更新：本地立即移除，网络失败恢复原列表。
  Future<bool> remove(int id) async {
    final originalList = _items;
    _items = _items.where((e) => e.id != id).toList();
    _error = null;
    _notify();

    try {
      await _repository.delete(id);
      try {
        await _persist();
      } catch (e) {
        debugPrint('BooksProvider cache write failed: $e');
      }
      return true;
    } catch (e) {
      _items = originalList;
      _error = e.toString();
      _notify();
      return false;
    }
  }

  Future<void> _persist() async {
    await _cache.writeList(_ns, _keyList, _items.map((e) => e.toJson()).toList());
  }
}
