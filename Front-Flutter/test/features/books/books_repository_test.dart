import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/features/books/data/repositories/books_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late BooksRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = BooksRepository(apiClient);
  });

  group('getBooks', () {
    test('解析列表数据返回 BookModel 列表', () async {
      when(() => apiClient.get('/books')).thenAnswer((_) async => {
        'code': 200,
        'message': 'ok',
        'data': [
          {'id': 1, 'title': '人类简史', 'author': '赫拉利'},
          {'id': 2, 'title': '活着', 'author': '余华'},
        ],
        'timestamp': '',
      });

      final books = await repository.getBooks();
      expect(books, hasLength(2));
      expect(books.first.title, '人类简史');
      expect(books.last.author, '余华');
    });

    test('data 为空或 null 时返回空列表', () async {
      when(() => apiClient.get('/books')).thenAnswer((_) async => {
        'code': 200,
        'message': 'ok',
        'data': null,
        'timestamp': '',
      });
      expect(await repository.getBooks(), isEmpty);
    });
  });

  group('create', () {
    test('POST /books 并返回创建的 BookModel', () async {
      when(() => apiClient.post('/books', data: any(named: 'data')))
          .thenAnswer((_) async => {
            'code': 200,
            'message': 'ok',
            'data': {'id': 3, 'title': '百年孤独', 'author': '马尔克斯'},
            'timestamp': '',
          });

      final book = await repository.create({'title': '百年孤独', 'author': '马尔克斯'});
      expect(book.id, 3);
      verify(() => apiClient.post('/books', data: {'title': '百年孤独', 'author': '马尔克斯'})).called(1);
    });
  });

  group('delete', () {
    test('DELETE /books/:id', () async {
      when(() => apiClient.delete('/books/1')).thenAnswer((_) async => {
        'code': 200,
        'message': 'ok',
        'data': null,
        'timestamp': '',
      });
      await repository.delete(1);
      verify(() => apiClient.delete('/books/1')).called(1);
    });
  });
}
