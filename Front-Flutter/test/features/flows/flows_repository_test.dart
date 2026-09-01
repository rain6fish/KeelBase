// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/features/flows/data/repositories/flows_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late FlowsRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = FlowsRepository(apiClient);
  });

  test('getMyTasks 解析审批任务列表', () async {
    when(() => apiClient.get('/flows/tasks')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': [
        {'id': 1, 'instanceId': 10, 'nodeId': 'approve', 'title': '请假审批', 'flowName': '请假流程'},
      ],
      'timestamp': '',
    });

    final tasks = await repository.getMyTasks();
    expect(tasks, hasLength(1));
    expect(tasks.first.nodeId, 'approve');
    expect(tasks.first.flowName, '请假流程');
  });

  test('approve 带 note 时提交', () async {
    when(() => apiClient.post('/flows/tasks/1/approve', data: any(named: 'data')))
        .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'data': null, 'timestamp': ''});

    await repository.approve(1, 'approve', note: '同意');
    verify(() => apiClient.post('/flows/tasks/1/approve', data: {'decision': 'approve', 'note': '同意'})).called(1);
  });

  test('approve 无 note 时不带该字段', () async {
    when(() => apiClient.post('/flows/tasks/2/approve', data: any(named: 'data')))
        .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'data': null, 'timestamp': ''});

    await repository.approve(2, 'reject');
    verify(() => apiClient.post('/flows/tasks/2/approve', data: {'decision': 'reject'})).called(1);
  });
}
