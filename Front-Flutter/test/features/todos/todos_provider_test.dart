import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/todos/data/models/todo_model.dart';
import 'package:front_app/features/todos/presentation/providers/todos_provider.dart';
import '../../helpers.dart';

void main() {
  late MockTodosRepository repository;
  late TodosProvider provider;

  const todo = TodoModel(id: 1, title: '买牛奶');

  setUp(() {
    repository = MockTodosRepository();
    provider = TodosProvider(repository);
  });

  tearDown(() {
    provider.dispose();
  });

  group('load', () {
    test('成功 → 填充列表', () async {
      when(() => repository.getTodos()).thenAnswer((_) async => [todo]);

      await provider.load();

      expect(provider.loading, isFalse);
      expect(provider.todos.length, 1);
      expect(provider.todos[0].title, '买牛奶');
      expect(provider.error, isNull);
    });

    test('失败 → error 设置', () async {
      when(() => repository.getTodos()).thenThrow(Exception('network'));

      await provider.load();

      expect(provider.error, isNotNull);
      expect(provider.todos, isEmpty);
    });
  });

  group('add', () {
    test('成功 → 追加列表', () async {
      when(() => repository.create(title: '新待办')).thenAnswer((_) async => TodoModel(id: 2, title: '新待办'));

      final ok = await provider.add('新待办');

      expect(ok, isTrue);
      expect(provider.todos.length, 1);
      expect(provider.todos[0].title, '新待办');
    });

    test('失败 → 返回 false', () async {
      when(() => repository.create(title: '新待办')).thenThrow(Exception('server'));

      final ok = await provider.add('新待办');

      expect(ok, isFalse);
    });
  });

  group('toggle', () {
    test('成功 → 更新完成状态', () async {
      when(() => repository.getTodos()).thenAnswer((_) async => [todo]);
      await provider.load();

      when(() => repository.toggleComplete(1, false)).thenAnswer((_) async => const TodoModel(id: 1, title: '买牛奶', completed: true));

      final ok = await provider.toggle(1);

      expect(ok, isTrue);
      expect(provider.todos[0].completed, isTrue);
    });
  });

  group('remove', () {
    test('成功 → 从列表移除', () async {
      when(() => repository.getTodos()).thenAnswer((_) async => [todo, const TodoModel(id: 2, title: 'B')]);
      await provider.load();

      when(() => repository.delete(1)).thenAnswer((_) async {});

      final ok = await provider.remove(1);

      expect(ok, isTrue);
      expect(provider.todos.length, 1);
      expect(provider.todos[0].id, 2);
    });
  });
}
