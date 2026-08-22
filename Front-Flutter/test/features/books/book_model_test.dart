import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/books/data/models/book_model.dart';

void main() {
  test('fromJson / toJson 往返', () {
    final book = BookModel.fromJson({'id': 1, 'title': '人类简史', 'author': '赫拉利'});
    expect(book.id, 1);
    expect(book.title, '人类简史');
    expect(book.author, '赫拉利');
    expect(book.status, 'unread');
    expect(book.rating, isNull);
    expect(book.toJson(), {'id': 1, 'title': '人类简史', 'author': '赫拉利', 'status': 'unread', 'rating': null});
  });

  test('copyWith 只替换指定字段', () {
    final book = BookModel(id: 1, title: 'A', author: 'B');
    expect(book.copyWith(title: 'C').title, 'C');
    expect(book.copyWith(title: 'C').author, 'B');
    expect(book.copyWith().title, 'A');
  });
}
