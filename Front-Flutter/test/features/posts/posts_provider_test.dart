// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/services/app_cache.dart';
import 'package:front_app/features/posts/data/models/post_model.dart';
import 'package:front_app/features/posts/data/repositories/posts_repository.dart';
import 'package:front_app/features/posts/presentation/providers/posts_provider.dart';

class MockPostsRepository extends Mock implements PostsRepository {}

void main() {
  late MockPostsRepository repo;
  late PostsProvider provider;

  setUp(() {
    repo = MockPostsRepository();
    provider = PostsProvider(repo, cache: AppCache.unavailable());
  });

  test('load 成功拉取帖子（含点赞/评论数）', () async {
    when(() => repo.getPosts()).thenAnswer((_) async => [
      PostModel(id: 1, title: 'Hi', likes: 3, comments: 2),
    ]);
    await provider.load();
    expect(provider.items.single.likes, 3);
    expect(provider.items.single.comments, 2);
  });

  test('toggleLike 乐观更新：未赞 → 点赞（+1）', () async {
    when(() => repo.getPosts()).thenAnswer((_) async => [
      PostModel(id: 1, title: 'Hi', likes: 0, comments: 0),
    ]);
    when(() => repo.like(1)).thenAnswer((_) async => 1);
    await provider.load();

    await provider.toggleLike(1);
    expect(provider.items.single.likedByMe, true);
    expect(provider.items.single.likes, 1);
  });

  test('toggleLike 失败回滚', () async {
    when(() => repo.getPosts()).thenAnswer((_) async => [
      PostModel(id: 1, title: 'Hi', likes: 5, comments: 0),
    ]);
    when(() => repo.like(1)).thenThrow(Exception('network'));
    await provider.load();

    await provider.toggleLike(1);
    expect(provider.items.single.likedByMe, false);
    expect(provider.items.single.likes, 5);
  });

  test('addComment 成功评论数 +1', () async {
    when(() => repo.getPosts()).thenAnswer((_) async => [
      PostModel(id: 1, title: 'Hi', likes: 0, comments: 1),
    ]);
    when(() => repo.comment(1, '不错')).thenAnswer((_) async {});
    await provider.load();

    await provider.addComment(1, '不错');
    expect(provider.items.single.comments, 2);
  });
}
