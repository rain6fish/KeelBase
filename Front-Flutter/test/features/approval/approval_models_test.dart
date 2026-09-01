// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/approval/data/models/approval_models.dart';

void main() {
  group('ApprovalRequestModel', () {
    test('fromJson 全字段', () {
      final r = ApprovalRequestModel.fromJson({
        'id': 1,
        'title': '采购报销',
        'type': 'expense',
        'amount': 1200.5,
        'reason': '差旅',
        'status': 'pending',
        'riskLevel': 'high',
        'aiRecommendation': 'approved',
        'createdAt': '2026-08-01T10:00:00Z',
      });
      expect(r.id, 1);
      expect(r.title, '采购报销');
      expect(r.type, 'expense');
      expect(r.amount, 1200.5);
      expect(r.reason, '差旅');
      expect(r.status, 'pending');
      expect(r.riskLevel, 'high');
      expect(r.aiRecommendation, 'approved');
      expect(r.createdAt, '2026-08-01T10:00:00Z');
    });

    test('缺省字段回退默认值', () {
      final r = ApprovalRequestModel.fromJson({'id': 1, 'reason': 'x'});
      expect(r.title, '');
      expect(r.type, 'general');
      expect(r.amount, 0);
      expect(r.status, 'pending');
      expect(r.riskLevel, 'low');
      expect(r.aiRecommendation, isNull);
    });

    test('toJson 往返', () {
      final r = ApprovalRequestModel(id: 1, title: 't', reason: 'r', amount: 10);
      final json = r.toJson();
      expect(json['amount'], 10);
      expect(json['status'], 'pending');
      expect(json['aiRecommendation'], isNull);
    });
  });

  group('ApprovalPolicyModel', () {
    test('fromJson 全字段', () {
      final p = ApprovalPolicyModel.fromJson({
        'id': 1,
        'title': '大额审批',
        'type': 'expense',
        'maxAmount': 5000,
        'description': '超过 5000 需审批',
        'active': false,
      });
      expect(p.title, '大额审批');
      expect(p.maxAmount, 5000);
      expect(p.description, '超过 5000 需审批');
      expect(p.active, false);
    });

    test('缺省默认值', () {
      final p = ApprovalPolicyModel.fromJson({'id': 1, 'title': '默认'});
      expect(p.type, 'general');
      expect(p.maxAmount, 1000);
      expect(p.description, isNull);
      expect(p.active, true);
    });
  });
}
