// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/posts/data/models/post_model.dart';
import 'package:front_app/features/posts/presentation/pages/posts_page.dart';
import 'package:front_app/features/posts/presentation/providers/posts_provider.dart';
import '../helpers.dart';

void main() {
  late MockPostsRepository repository;

  setUp(() {
    repository = MockPostsRepository();
    when(() => repository.getPosts()).thenAnswer((_) async => [
      PostModel(id: 1, title: '欢迎来到社区', content: '……', likes: 3, comments: 1),
    ]);
  });

  Widget wrap() => wrapCupertinoPage(
        const PostsPage(),
        providers: [
          ChangeNotifierProvider<PostsProvider>(
            create: (_) => PostsProvider(repository),
          ),
        ],
      );

  testWidgets('渲染社区动态列表', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('欢迎来到社区'), findsOneWidget);
  });
}
