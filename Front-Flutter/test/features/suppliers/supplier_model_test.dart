// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/suppliers/data/models/supplier_model.dart';

void main() {
  group('SupplierModel', () {
    test('fromJson 全字段', () {
      final s = SupplierModel.fromJson({
        'id': 1,
        'name': '华东供应商',
        'contact': '张三',
        'status': 'active',
        'riskLevel': 'high',
        'annualSpend': 500000,
      });
      expect(s.id, 1);
      expect(s.name, '华东供应商');
      expect(s.contact, '张三');
      expect(s.status, 'active');
      expect(s.riskLevel, 'high');
      expect(s.annualSpend, 500000);
    });

    test('缺省字段回退默认值', () {
      final s = SupplierModel.fromJson({'id': 1, 'name': 'n', 'contact': 'c'});
      expect(s.status, 'active');
      expect(s.riskLevel, 'low');
      expect(s.annualSpend, isNull);
    });

    test('toJson 往返', () {
      final s = SupplierModel(id: 1, name: 'n', contact: 'c', status: 'active');
      final json = s.toJson();
      expect(json['status'], 'active');
      expect(json['annualSpend'], isNull);
    });

    test('copyWith 覆盖指定字段、保持其他字段', () {
      final s = SupplierModel(id: 1, name: 'n', contact: 'c', status: 'active');
      final updated = s.copyWith(status: 'inactive', annualSpend: 123);
      expect(updated.status, 'inactive');
      expect(updated.annualSpend, 123);
      expect(updated.name, 'n');
      expect(updated.contact, 'c');
      expect(updated.riskLevel, 'low');
    });
  });
}
