import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/posts/data/repositories/posts_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late PostsRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = PostsRepository(apiClient);
  });

  test('getPosts 解析社区动态列表', () async {
    when(() => apiClient.get('/posts')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': [
        {'id': 1, 'title': '欢迎', 'content': 'hi', 'likes': 3, 'comments': 1, 'likedByMe': true},
      ],
      'timestamp': '',
    });
    final posts = await repository.getPosts();
    expect(posts, hasLength(1));
    expect(posts.first.likes, 3);
    expect(posts.first.likedByMe, isTrue);
  });

  test('create / delete 委托 client', () async {
    when(() => apiClient.post('/posts', data: any(named: 'data')))
        .thenAnswer((_) async => {
          'code': 200,
          'message': 'ok',
          'data': {'id': 2, 'title': '新帖', 'likes': 0, 'comments': 0, 'likedByMe': false},
          'timestamp': '',
        });
    when(() => apiClient.delete('/posts/2')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': null,
      'timestamp': '',
    });

    final post = await repository.create({'title': '新帖'});
    expect(post.id, 2);
    await repository.delete(2);
    verify(() => apiClient.post('/posts', data: {'title': '新帖'})).called(1);
    verify(() => apiClient.delete('/posts/2')).called(1);
  });

  test('like / unlike 返回最新点赞数', () async {
    when(() => apiClient.post('/posts/1/like')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': {'likes': 4},
      'timestamp': '',
    });
    when(() => apiClient.delete('/posts/1/like')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': {'likes': 3},
      'timestamp': '',
    });

    expect(await repository.like(1), 4);
    expect(await repository.unlike(1), 3);
  });

  test('comment 提交评论内容', () async {
    when(() => apiClient.post('/posts/1/comments', data: any(named: 'data')))
        .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'data': null, 'timestamp': ''});

    await repository.comment(1, '不错');
    verify(() => apiClient.post('/posts/1/comments', data: {'content': '不错'})).called(1);
  });
}
