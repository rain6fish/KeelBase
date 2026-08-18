import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/contracts/data/models/contract_model.dart';

void main() {
  group('ContractModel', () {
    test('fromJson 全字段', () {
      final c = ContractModel.fromJson({
        'id': 1,
        'name': '服务合同',
        'counterparty': '华润',
        'status': 'active',
        'amount': 100000,
      });
      expect(c.id, 1);
      expect(c.name, '服务合同');
      expect(c.counterparty, '华润');
      expect(c.status, 'active');
      expect(c.amount, 100000);
    });

    test('缺省字段回退默认值', () {
      final c = ContractModel.fromJson({'id': 1, 'name': 'n', 'counterparty': 'cp'});
      expect(c.status, 'draft');
      expect(c.amount, isNull);
    });

    test('toJson 往返', () {
      final c = ContractModel(id: 1, name: 'n', counterparty: 'cp', status: 'draft', amount: 5);
      final json = c.toJson();
      expect(json['status'], 'draft');
      expect(json['amount'], 5);
    });

    test('copyWith 覆盖指定字段、保持其他字段', () {
      final c = ContractModel(id: 1, name: 'n', counterparty: 'cp', status: 'draft');
      final updated = c.copyWith(status: 'active', amount: 999);
      expect(updated.status, 'active');
      expect(updated.amount, 999);
      expect(updated.name, 'n');
      expect(updated.counterparty, 'cp');
      expect(updated.id, 1);
    });
  });
}
