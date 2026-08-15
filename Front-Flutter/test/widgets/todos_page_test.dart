import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/todos/data/models/todo_model.dart';
import 'package:front_app/features/todos/presentation/pages/todos_page.dart';
import 'package:front_app/features/todos/presentation/providers/todos_provider.dart';
import '../helpers.dart';

void main() {
  late MockTodosRepository repository;

  setUp(() {
    repository = MockTodosRepository();
    when(() => repository.getTodos()).thenAnswer((_) async => [
      TodoModel(id: 1, title: '买牛奶'),
      TodoModel(id: 2, title: '交房租', completed: true),
    ]);
  });

  Widget wrap() => wrapCupertinoPage(
        const TodosPage(),
        providers: [
          ChangeNotifierProvider<TodosProvider>(
            create: (_) => TodosProvider(repository),
          ),
        ],
      );

  testWidgets('渲染待办列表', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('待办'), findsOneWidget);
    expect(find.text('买牛奶'), findsOneWidget);
    expect(find.text('交房租'), findsOneWidget);
  });
}
