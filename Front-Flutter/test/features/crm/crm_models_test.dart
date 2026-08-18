import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/crm/data/models/crm_activity_model.dart';
import 'package:front_app/features/crm/data/models/crm_order_model.dart';
import 'package:front_app/features/crm/data/models/crm_risk_model.dart';
import 'package:front_app/features/crm/data/models/crm_task_model.dart';
import 'package:front_app/features/crm/data/models/customer_model.dart';
import 'package:front_app/features/crm/data/models/customer_detail_model.dart';

void main() {
  group('CustomerModel', () {
    test('fromJson 全字段 + 默认值', () {
      final c = CustomerModel.fromJson({
        'id': 1,
        'name': '华润',
        'email': 'a@b.com',
        'phone': '13800000000',
        'company': '华润集团',
        'status': 'active',
        'riskLevel': 'high',
        'notes': '大客户',
        'createdAt': '2026-08-01T10:00:00Z',
      });
      expect(c.id, 1);
      expect(c.name, '华润');
      expect(c.email, 'a@b.com');
      expect(c.phone, '13800000000');
      expect(c.company, '华润集团');
      expect(c.status, 'active');
      expect(c.riskLevel, 'high');
      expect(c.notes, '大客户');
      expect(c.createdAt, '2026-08-01T10:00:00Z');
    });

    test('缺省字段回退默认值', () {
      final c = CustomerModel.fromJson({'id': 2, 'name': '默认客户'});
      expect(c.status, 'lead');
      expect(c.riskLevel, 'low');
      expect(c.email, isNull);
      expect(c.notes, isNull);
    });

    test('toJson 往返一致', () {
      final c = CustomerModel(id: 1, name: '华润', status: 'active');
      final json = c.toJson();
      expect(json['id'], 1);
      expect(json['name'], '华润');
      expect(json['status'], 'active');
    });

    test('copyWith 仅覆盖指定字段', () {
      final c = CustomerModel(id: 1, name: '华润', status: 'lead');
      final updated = c.copyWith(status: 'active', notes: '新备注');
      expect(updated.status, 'active');
      expect(updated.notes, '新备注');
      expect(updated.name, '华润'); // 未指定字段保持原值
      expect(updated.id, 1);
      // 显式传 null 也保持原值（Object sentinel 语义）
      expect(c.copyWith(email: null).email, isNull);
    });
  });

  group('CustomerDetailModel', () {
    test('fromJson 聚合解析 customer + 子资源列表', () {
      final d = CustomerDetailModel.fromJson({
        'customer': {'id': 1, 'name': '华润'},
        'orders': [
          {'id': 10, 'customerId': 1, 'amount': 100.5, 'status': 'paid'},
        ],
        'activities': [
          {'id': 20, 'customerId': 1, 'summary': '跟进'},
        ],
        'tasks': [
          {'id': 30, 'customerId': 1, 'title': '回访'},
        ],
        'risks': [
          {'id': 40, 'customerId': 1, 'reason': '回款慢'},
        ],
      });
      expect(d.customer.id, 1);
      expect(d.orders.single.amount, 100.5);
      expect(d.activities.single.summary, '跟进');
      expect(d.tasks.single.title, '回访');
      expect(d.risks.single.reason, '回款慢');
    });

    test('缺失子资源回退空列表', () {
      final d = CustomerDetailModel.fromJson({'customer': {'id': 1, 'name': 'x'}});
      expect(d.orders, isEmpty);
      expect(d.activities, isEmpty);
      expect(d.tasks, isEmpty);
      expect(d.risks, isEmpty);
    });

    test('RiskAnalysisModel 解析', () {
      final r = RiskAnalysisModel.fromJson({'level': 'high', 'score': 85, 'reasons': ['回款慢', '毛利低']});
      expect(r.level, 'high');
      expect(r.score, 85);
      expect(r.reasons, ['回款慢', '毛利低']);
    });

    test('RiskAnalysisModel 缺省默认', () {
      final r = RiskAnalysisModel.fromJson({'level': 'low'});
      expect(r.score, 0);
      expect(r.reasons, isEmpty);
    });
  });

  group('CrmActivityModel', () {
    test('fromJson 默认 type=note', () {
      final a = CrmActivityModel.fromJson({'id': 1, 'customerId': 5, 'summary': '电话沟通'});
      expect(a.type, 'note');
      expect(a.happenedAt, isNull);
    });

    test('toJson 全字段', () {
      final a = CrmActivityModel(id: 1, customerId: 5, type: 'call', summary: 'x', happenedAt: 't');
      expect(a.toJson(), {'id': 1, 'customerId': 5, 'type': 'call', 'summary': 'x', 'happenedAt': 't'});
    });
  });

  group('CrmOrderModel', () {
    test('fromJson 金额 double + 默认状态 pending', () {
      final o = CrmOrderModel.fromJson({'id': 1, 'customerId': 5, 'amount': 99.9});
      expect(o.amount, 99.9);
      expect(o.status, 'pending');
      expect(o.orderDate, isNull);
    });

    test('toJson 往返', () {
      final o = CrmOrderModel(id: 1, customerId: 5, amount: 88.8, status: 'paid', orderDate: '2026-01-01');
      expect(o.toJson()['amount'], 88.8);
      expect(o.toJson()['status'], 'paid');
    });
  });

  group('CrmRiskModel', () {
    test('fromJson 默认 level=medium', () {
      final r = CrmRiskModel.fromJson({'id': 1, 'customerId': 5, 'reason': '回款慢'});
      expect(r.level, 'medium');
      expect(r.detectedAt, isNull);
      expect(r.resolvedAt, isNull);
    });

    test('toJson 全字段', () {
      final r = CrmRiskModel(id: 1, customerId: 5, level: 'high', reason: 'x', detectedAt: 'd');
      expect(r.toJson()['level'], 'high');
      expect(r.toJson()['reason'], 'x');
    });
  });

  group('CrmTaskModel', () {
    test('fromJson 可选 customerId', () {
      final t = CrmTaskModel.fromJson({'id': 1, 'title': '回访'});
      expect(t.customerId, isNull);
      expect(t.status, 'pending');
      expect(t.description, isNull);
    });

    test('fromJson 全字段', () {
      final t = CrmTaskModel.fromJson({
        'id': 1,
        'customerId': 5,
        'title': '回访',
        'description': '客户回访',
        'dueDate': '2026-08-20',
        'status': 'done',
      });
      expect(t.customerId, 5);
      expect(t.dueDate, '2026-08-20');
      expect(t.status, 'done');
    });

    test('toJson 往返', () {
      final t = CrmTaskModel(id: 1, customerId: 5, title: '回访', status: 'pending');
      expect(t.toJson()['title'], '回访');
      expect(t.toJson()['customerId'], 5);
    });
  });
}
