import 'package:flutter/foundation.dart';
import '../../../../core/services/app_cache.dart';
import '../../data/models/post_model.dart';
import '../../data/repositories/posts_repository.dart';

/// 帖子状态管理（UX-1：缓存优先 + 乐观更新）。
class PostsProvider extends ChangeNotifier {
  final PostsRepository _repository;
  final AppCache _cache;

  static const _ns = 'posts';
  static const _keyList = 'list';

  List<PostModel> _items = [];
  bool _loading = false;
  bool _fromCache = false;
  String? _error;

  PostsProvider(this._repository, {AppCache? cache})
      : _cache = cache ?? AppCache.unavailable();

  List<PostModel> get items => _items;
  bool get loading => _loading;
  String? get error => _error;
  /// 当前数据是否来自离线缓存（网络未刷新成功）。
  bool get fromCache => _fromCache;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();

    // 缓存优先：先展示本地缓存，避免空白
    final cached = await _cache.readList(_ns, _keyList);
    if (cached != null) {
      _items = cached.map(PostModel.fromJson).toList();
      _fromCache = true;
      notifyListeners();
    }

    try {
      _items = await _repository.getPosts();
      _fromCache = false;
      await _cache.writeList(_ns, _keyList, _items.map((e) => e.toJson()).toList());
    } catch (e) {
      if (_items.isEmpty) _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> add(Map<String, dynamic> data) async {
    try {
      final item = await _repository.create(data);
      _items = [..._items, item];
      _error = null;
      notifyListeners();
      await _persist();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// 乐观更新：本地立即移除，网络失败恢复原列表。
  Future<bool> remove(int id) async {
    final originalList = _items;
    _items = _items.where((e) => e.id != id).toList();
    _error = null;
    notifyListeners();

    try {
      await _repository.delete(id);
      await _persist();
      return true;
    } catch (e) {
      _items = originalList;
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// GROWTH-2 点赞切换（乐观更新，失败回滚）
  Future<void> toggleLike(int id) async {
    final index = _items.indexWhere((e) => e.id == id);
    if (index < 0) return;
    final current = _items[index];
    final nextLiked = !current.likedByMe;
    // 乐观更新
    _items[index] = current.copyWith(
      likedByMe: nextLiked,
      likes: current.likes + (nextLiked ? 1 : -1),
    );
    notifyListeners();
    try {
      final likes = nextLiked ? await _repository.like(id) : await _repository.unlike(id);
      _items[index] = _items[index].copyWith(likes: likes);
      notifyListeners();
    } catch (_) {
      // 失败回滚
      _items[index] = current;
      notifyListeners();
    }
  }

  /// GROWTH-2 评论（成功刷新评论数）
  Future<bool> addComment(int id, String content) async {
    try {
      await _repository.comment(id, content);
      final index = _items.indexWhere((e) => e.id == id);
      if (index >= 0) {
        _items[index] = _items[index].copyWith(comments: _items[index].comments + 1);
        notifyListeners();
      }
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> _persist() async {
    await _cache.writeList(_ns, _keyList, _items.map((e) => e.toJson()).toList());
  }
}
