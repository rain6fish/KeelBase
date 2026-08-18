import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/flows/data/models/flow_task_model.dart';
import 'package:front_app/features/flows/presentation/providers/flows_provider.dart';
import '../../helpers.dart';

void main() {
  late MockFlowsRepository repo;
  late FlowsProvider provider;

  setUp(() {
    repo = MockFlowsRepository();
    provider = FlowsProvider(repo);
  });

  FlowTaskModel task({int id = 1}) => FlowTaskModel(id: id, instanceId: 1, nodeId: 'n1', title: '审批任务');

  test('load 成功拉取待办列表', () async {
    when(() => repo.getMyTasks()).thenAnswer((_) async => [task()]);
    await provider.load();
    expect(provider.tasks.single.title, '审批任务');
    expect(provider.loading, isFalse);
  });

  test('load 失败置 error', () async {
    when(() => repo.getMyTasks()).thenThrow(Exception('x'));
    await provider.load();
    expect(provider.error, isNotNull);
    expect(provider.loading, isFalse);
  });

  test('approve 成功从列表移除该任务', () async {
    when(() => repo.getMyTasks()).thenAnswer((_) async => [task(id: 1), task(id: 2)]);
    await provider.load();
    when(() => repo.approve(1, 'approve', note: any(named: 'note'))).thenAnswer((_) async {});
    final ok = await provider.approve(1, 'approve');
    expect(ok, isTrue);
    expect(provider.tasks.map((e) => e.id), [2]);
    verify(() => repo.approve(1, 'approve', note: any(named: 'note'))).called(1);
  });

  test('approve 失败返回 false 置 error，列表不变', () async {
    when(() => repo.getMyTasks()).thenAnswer((_) async => [task(id: 1)]);
    await provider.load();
    when(() => repo.approve(1, 'reject', note: any(named: 'note'))).thenThrow(Exception('x'));
    final ok = await provider.approve(1, 'reject');
    expect(ok, isFalse);
    expect(provider.error, isNotNull);
    expect(provider.tasks, hasLength(1));
  });
}
