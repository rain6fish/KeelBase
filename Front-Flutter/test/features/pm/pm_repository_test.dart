import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/pm/data/repositories/pm_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late PmRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = PmRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getProjects 无过滤只带 limit', () async {
    when(() => apiClient.get('/pm/projects', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res({
              'items': [
                {'id': 1, 'name': '官网改版'},
              ],
            }));
    final list = await repository.getProjects();
    expect(list.single.name, '官网改版');
    verify(() => apiClient.get('/pm/projects', queryParameters: {'limit': '100'})).called(1);
  });

  test('getProjects 带过滤参数拼 query', () async {
    when(() => apiClient.get('/pm/projects', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res({'items': []}));
    await repository.getProjects(status: 'active', keyword: '官网');
    verify(() => apiClient.get('/pm/projects', queryParameters: {'status': 'active', 'keyword': '官网', 'limit': '100'}))
        .called(1);
  });

  test('getProjects 空列表返回空数组', () async {
    when(() => apiClient.get('/pm/projects', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res(null));
    expect(await repository.getProjects(), isEmpty);
  });

  test('getProjectDetail 解析聚合详情', () async {
    when(() => apiClient.get('/pm/projects/1')).thenAnswer((_) async => res({
          'project': {'id': 1, 'name': '官网改版'},
          'milestones': [
            {'id': 1, 'projectId': 1, 'title': '设计'},
          ],
          'memberCount': 5,
        }));
    final detail = await repository.getProjectDetail(1);
    expect(detail.project.name, '官网改版');
    expect(detail.milestones.single.title, '设计');
    expect(detail.memberCount, 5);
  });

  test('createProject POST 并解析', () async {
    when(() => apiClient.post('/pm/projects', data: any(named: 'data')))
        .thenAnswer((_) async => res({'id': 2, 'name': '新项目'}));
    final p = await repository.createProject({'name': '新项目'});
    expect(p.id, 2);
    verify(() => apiClient.post('/pm/projects', data: {'name': '新项目'})).called(1);
  });

  test('deleteProject 调用 DELETE', () async {
    when(() => apiClient.delete('/pm/projects/1')).thenAnswer((_) async => res(null));
    await repository.deleteProject(1);
    verify(() => apiClient.delete('/pm/projects/1')).called(1);
  });

  test('createMilestone POST 到 milestones', () async {
    when(() => apiClient.post('/pm/projects/1/milestones', data: any(named: 'data')))
        .thenAnswer((_) async => res(null));
    await repository.createMilestone(1, {'title': '设计'});
    verify(() => apiClient.post('/pm/projects/1/milestones', data: {'title': '设计'})).called(1);
  });

  test('createTask 带 projectId/title，可选 dueDate', () async {
    when(() => apiClient.post('/pm/tasks', data: any(named: 'data'))).thenAnswer((_) async => res(null));
    await repository.createTask(projectId: 1, title: '开发');
    verify(() => apiClient.post('/pm/tasks', data: {'projectId': 1, 'title': '开发'})).called(1);
  });

  test('createTask 带 dueDate', () async {
    when(() => apiClient.post('/pm/tasks', data: any(named: 'data'))).thenAnswer((_) async => res(null));
    await repository.createTask(projectId: 1, title: '开发', dueDate: '2026-03-01');
    verify(() => apiClient.post('/pm/tasks', data: {'projectId': 1, 'title': '开发', 'dueDate': '2026-03-01'}))
        .called(1);
  });

  test('completeTask POST /pm/tasks/:id/complete', () async {
    when(() => apiClient.post('/pm/tasks/1/complete')).thenAnswer((_) async => res(null));
    await repository.completeTask(1);
    verify(() => apiClient.post('/pm/tasks/1/complete')).called(1);
  });
}
