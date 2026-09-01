// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/approval/data/repositories/approval_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late ApprovalRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = ApprovalRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getRequests 无过滤只带 limit', () async {
    when(() => apiClient.get('/approval/requests', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res({
              'items': [
                {'id': 1, 'title': '采购报销', 'reason': '差旅'},
              ],
            }));
    final list = await repository.getRequests();
    expect(list.single.title, '采购报销');
    verify(() => apiClient.get('/approval/requests', queryParameters: {'limit': '100'})).called(1);
  });

  test('getRequests 带 status 拼 query', () async {
    when(() => apiClient.get('/approval/requests', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res({'items': []}));
    await repository.getRequests(status: 'pending');
    verify(() => apiClient.get('/approval/requests', queryParameters: {'status': 'pending', 'limit': '100'}))
        .called(1);
  });

  test('getRequests 空列表返回空数组', () async {
    when(() => apiClient.get('/approval/requests', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res(null));
    expect(await repository.getRequests(), isEmpty);
  });

  test('createRequest POST 并解析', () async {
    when(() => apiClient.post('/approval/requests', data: any(named: 'data')))
        .thenAnswer((_) async => res({'id': 2, 'title': '新申请', 'reason': 'r'}));
    final r = await repository.createRequest({'title': '新申请'});
    expect(r.id, 2);
    verify(() => apiClient.post('/approval/requests', data: {'title': '新申请'})).called(1);
  });

  test('reviewRequest POST /review', () async {
    when(() => apiClient.post('/approval/requests/1/review')).thenAnswer((_) async => res({
          'id': 1,
          'title': 't',
          'reason': 'r',
          'aiRecommendation': 'approved',
        }));
    final r = await repository.reviewRequest(1);
    expect(r.aiRecommendation, 'approved');
  });

  test('decideRequest POST /decide 带 decision', () async {
    when(() => apiClient.post('/approval/requests/1/decide', data: any(named: 'data')))
        .thenAnswer((_) async => res({'id': 1, 'title': 't', 'reason': 'r', 'status': 'approved'}));
    final r = await repository.decideRequest(1, 'approved');
    expect(r.status, 'approved');
    verify(() => apiClient.post('/approval/requests/1/decide', data: {'decision': 'approved'})).called(1);
  });

  test('getPolicies 解析策略列表', () async {
    when(() => apiClient.get('/approval/policies')).thenAnswer((_) async => res([
          {'id': 1, 'title': '大额审批', 'maxAmount': 5000},
        ]));
    final list = await repository.getPolicies();
    expect(list.single.title, '大额审批');
    expect(list.single.maxAmount, 5000);
  });
}
