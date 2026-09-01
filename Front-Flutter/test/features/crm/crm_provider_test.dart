// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/services/app_cache.dart';
import 'package:front_app/features/crm/data/models/customer_model.dart';
import 'package:front_app/features/crm/data/models/customer_detail_model.dart';
import 'package:front_app/features/crm/data/repositories/crm_repository.dart';
import 'package:front_app/features/crm/presentation/providers/crm_provider.dart';
import '../../helpers.dart';

class MockCrmRepository extends Mock implements CrmRepository {}

void main() {
  late MockCrmRepository repo;
  late CrmProvider provider;

  setUp(() {
    repo = MockCrmRepository();
    provider = CrmProvider(repo);
  });

  group('CustomerModel', () {
    test('fromJson 解析', () {
      final c = CustomerModel.fromJson({'id': 1, 'name': '华润', 'status': 'active', 'riskLevel': 'high'});
      expect(c.name, '华润');
      expect(c.riskLevel, 'high');
    });
  });

  group('CrmProvider', () {
    test('loadCustomers 拉取并缓存列表', () async {
      when(() => repo.getCustomers())
          .thenAnswer((_) async => [CustomerModel(id: 1, name: '华润', riskLevel: 'high')]);
      await provider.loadCustomers();
      expect(provider.customers.single.name, '华润');
      expect(provider.loading, isFalse);
    });

    test('loadDetail 失败置 error', () async {
      when(() => repo.getCustomerDetail(9)).thenThrow(Exception('网络错误'));
      final ok = await provider.loadDetail(9);
      expect(ok, isFalse);
      expect(provider.error, isNotNull);
    });

    test('addTask 成功后刷新详情', () async {
      when(() => repo.createTask(customerId: any(named: 'customerId'), title: any(named: 'title'), description: any(named: 'description'), dueDate: any(named: 'dueDate')))
          .thenAnswer((_) async {});
      when(() => repo.getCustomerDetail(1)).thenAnswer((_) async => CustomerDetailModel(
            customer: CustomerModel(id: 1, name: '华润'),
          ));
      provider = CrmProvider(repo);
      await provider.loadDetail(1);
      final ok = await provider.addTask(customerId: 1, title: '跟进');
      expect(ok, isTrue);
    });
  });
}
