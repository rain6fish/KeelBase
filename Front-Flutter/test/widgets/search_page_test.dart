// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/search/presentation/pages/search_page.dart';
import 'package:front_app/features/search/presentation/providers/search_provider.dart';
import '../helpers.dart';

void main() {
  late MockSearchRepository repository;

  setUp(() {
    repository = MockSearchRepository();
  });

  Widget wrap() => wrapCupertinoPage(
        const SearchPage(),
        providers: [
          ChangeNotifierProvider<SearchProvider>(
            create: (_) => SearchProvider(repository),
          ),
        ],
      );

  testWidgets('渲染搜索页（搜索框 + 历史/会话区域）', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(CupertinoTextField), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
