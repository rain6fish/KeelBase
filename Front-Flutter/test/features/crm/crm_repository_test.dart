// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/crm/data/models/customer_detail_model.dart';
import 'package:front_app/features/crm/data/repositories/crm_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late CrmRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = CrmRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  group('getCustomers', () {
    test('无过滤参数只带 limit', () async {
      when(() => apiClient.get('/crm/customers', queryParameters: any(named: 'queryParameters')))
          .thenAnswer((_) async => res({
                'items': [
                  {'id': 1, 'name': '华润', 'status': 'active'},
                ],
              }));
      final list = await repository.getCustomers();
      expect(list.single.name, '华润');
      verify(() => apiClient.get('/crm/customers', queryParameters: {'limit': '100'})).called(1);
    });

    test('带过滤参数拼 query', () async {
      when(() => apiClient.get('/crm/customers', queryParameters: any(named: 'queryParameters')))
          .thenAnswer((_) async => res({
                'items': [
                  {'id': 2, 'name': 'B'},
                ],
              }));
      await repository.getCustomers(status: 'active', riskLevel: 'high', keyword: '华');
      verify(() => apiClient.get('/crm/customers',
              queryParameters: {'status': 'active', 'riskLevel': 'high', 'keyword': '华', 'limit': '100'}))
          .called(1);
    });

    test('空列表返回空数组', () async {
      when(() => apiClient.get('/crm/customers', queryParameters: any(named: 'queryParameters')))
          .thenAnswer((_) async => res(null));
      final list = await repository.getCustomers();
      expect(list, isEmpty);
    });
  });

  group('detail/create/update/delete', () {
    test('getCustomerDetail 解析聚合详情', () async {
      when(() => apiClient.get('/crm/customers/1')).thenAnswer((_) async => res({
            'customer': {'id': 1, 'name': '华润'},
            'orders': [
              {'id': 10, 'customerId': 1, 'amount': 100, 'status': 'paid'},
            ],
          }));
      final detail = await repository.getCustomerDetail(1);
      expect(detail.customer.name, '华润');
      expect(detail.orders.single.status, 'paid');
    });

    test('createCustomer POST 并解析', () async {
      when(() => apiClient.post('/crm/customers', data: any(named: 'data')))
          .thenAnswer((_) async => res({'id': 3, 'name': '新建'}));
      final c = await repository.createCustomer({'name': '新建'});
      expect(c.id, 3);
      verify(() => apiClient.post('/crm/customers', data: {'name': '新建'})).called(1);
    });

    test('updateCustomer PATCH 并解析', () async {
      when(() => apiClient.patch('/crm/customers/1', data: any(named: 'data')))
          .thenAnswer((_) async => res({'id': 1, 'name': '改后'}));
      final c = await repository.updateCustomer(1, {'name': '改后'});
      expect(c.name, '改后');
    });

    test('deleteCustomer 调用 DELETE', () async {
      when(() => apiClient.delete('/crm/customers/1')).thenAnswer((_) async => res(null));
      await repository.deleteCustomer(1);
      verify(() => apiClient.delete('/crm/customers/1')).called(1);
    });
  });

  group('子资源写操作', () {
    test('createOrder POST 到 orders', () async {
      when(() => apiClient.post('/crm/customers/1/orders', data: any(named: 'data')))
          .thenAnswer((_) async => res(null));
      await repository.createOrder(1, {'amount': 200});
      verify(() => apiClient.post('/crm/customers/1/orders', data: {'amount': 200})).called(1);
    });

    test('createActivity POST 到 activities', () async {
      when(() => apiClient.post('/crm/customers/1/activities', data: any(named: 'data')))
          .thenAnswer((_) async => res(null));
      await repository.createActivity(1, {'summary': '跟进'});
      verify(() => apiClient.post('/crm/customers/1/activities', data: {'summary': '跟进'})).called(1);
    });

    test('createTask 无 customerId 不带该字段', () async {
      when(() => apiClient.post('/crm/tasks', data: any(named: 'data')))
          .thenAnswer((_) async => res(null));
      await repository.createTask(title: '回访');
      verify(() => apiClient.post('/crm/tasks', data: {'title': '回访'})).called(1);
    });

    test('createTask 带 customerId/dueDate', () async {
      when(() => apiClient.post('/crm/tasks', data: any(named: 'data')))
          .thenAnswer((_) async => res(null));
      await repository.createTask(customerId: 1, title: '回访', description: 'd', dueDate: '2026-08-20');
      verify(() => apiClient.post('/crm/tasks',
              data: {'customerId': 1, 'title': '回访', 'description': 'd', 'dueDate': '2026-08-20'}))
          .called(1);
    });

    test('completeTask POST /crm/tasks/:id/complete', () async {
      when(() => apiClient.post('/crm/tasks/1/complete')).thenAnswer((_) async => res(null));
      await repository.completeTask(1);
      verify(() => apiClient.post('/crm/tasks/1/complete')).called(1);
    });
  });
}
