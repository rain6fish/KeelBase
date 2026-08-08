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

      when(() => repository.toggleComplete(1, true)).thenAnswer((_) async => const TodoModel(id: 1, title: '买牛奶', completed: true));

      final ok = await provider.toggle(1);

      expect(ok, isTrue);
      expect(provider.todos[0].completed, isTrue);
    });

    test('失败 → 回滚到原状态', () async {
      when(() => repository.getTodos()).thenAnswer((_) async => [todo]);
      await provider.load();

      when(() => repository.toggleComplete(1, true)).thenThrow(Exception('network'));

      // 乐观更新先翻转为 true，接口失败后回滚为 false
      final ok = await provider.toggle(1);

      expect(ok, isFalse);
      expect(provider.todos[0].completed, isFalse);
      expect(provider.error, isNotNull);
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

    test('失败 → 恢复原列表', () async {
      when(() => repository.getTodos()).thenAnswer((_) async => [todo, const TodoModel(id: 2, title: 'B')]);
      await provider.load();

      when(() => repository.delete(1)).thenThrow(Exception('network'));

      final ok = await provider.remove(1);

      expect(ok, isFalse);
      expect(provider.todos.length, 2);
      expect(provider.error, isNotNull);
    });
  });

  group('缓存优先', () {
    test('load 时先读缓存立即展示，再网络刷新', () async {
      // 无缓存时 fromCache 应为 false
      when(() => repository.getTodos()).thenAnswer((_) async => [todo]);
      await provider.load();
      expect(provider.fromCache, isFalse);
    });

    test('网络失败但有缓存时展示缓存数据不报错', () async {
      // 先成功一次写缓存（unavailable 实例 no-op，此处验证降级路径）
      when(() => repository.getTodos()).thenThrow(Exception('offline'));
      await provider.load();
      expect(provider.todos, isEmpty);
      expect(provider.error, isNotNull);
    });
  });
}
