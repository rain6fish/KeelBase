import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/tags/data/models/tag_model.dart';
import 'package:front_app/features/tags/presentation/pages/tags_page.dart';
import 'package:front_app/features/tags/presentation/providers/tags_provider.dart';
import '../helpers.dart';

void main() {
  late MockTagsRepository repository;

  setUp(() {
    repository = MockTagsRepository();
    when(() => repository.getTags()).thenAnswer((_) async => [
      TagModel(id: 1, name: '工作'),
      TagModel(id: 2, name: '生活'),
    ]);
  });

  Widget wrap() => wrapCupertinoPage(
        const TagsPage(),
        providers: [
          ChangeNotifierProvider<TagsProvider>(
            create: (_) => TagsProvider(repository),
          ),
        ],
      );

  testWidgets('渲染标签列表', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('标签'), findsOneWidget);
    expect(find.text('工作'), findsOneWidget);
    expect(find.text('生活'), findsOneWidget);
  });
}
