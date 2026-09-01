// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/books/data/models/book_model.dart';
import 'package:front_app/features/books/presentation/pages/books_page.dart';
import 'package:front_app/features/books/presentation/providers/books_provider.dart';
import '../helpers.dart';

void main() {
  late MockBooksRepository repository;

  setUp(() {
    repository = MockBooksRepository();
    when(() => repository.getBooks()).thenAnswer((_) async => [
      BookModel(id: 1, title: '人类简史', author: '赫拉利'),
    ]);
  });

  Widget wrap() => wrapCupertinoPage(
        const BooksPage(),
        providers: [
          ChangeNotifierProvider<BooksProvider>(
            create: (_) => BooksProvider(repository),
          ),
        ],
      );

  testWidgets('渲染图书列表', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('图书'), findsOneWidget);
    expect(find.text('人类简史'), findsOneWidget);
  });
}
