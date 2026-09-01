// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/pm/data/models/project_model.dart';

void main() {
  group('ProjectModel', () {
    test('fromJson 全字段', () {
      final p = ProjectModel.fromJson({
        'id': 1,
        'name': '官网改版',
        'description': '官网 V2',
        'status': 'active',
        'riskLevel': 'high',
        'startDate': '2026-01-01',
        'endDate': '2026-06-30',
      });
      expect(p.id, 1);
      expect(p.name, '官网改版');
      expect(p.description, '官网 V2');
      expect(p.status, 'active');
      expect(p.riskLevel, 'high');
      expect(p.startDate, '2026-01-01');
      expect(p.endDate, '2026-06-30');
    });

    test('缺省字段回退默认值', () {
      final p = ProjectModel.fromJson({'id': 1, 'name': 'x'});
      expect(p.status, 'planned');
      expect(p.riskLevel, 'low');
      expect(p.description, isNull);
      expect(p.endDate, isNull);
    });

    test('toJson 往返', () {
      final p = ProjectModel(id: 1, name: 'x', status: 'active');
      final json = p.toJson();
      expect(json['name'], 'x');
      expect(json['status'], 'active');
      expect(json['description'], isNull);
    });
  });

  group('MilestoneModel', () {
    test('fromJson 默认 pending', () {
      final m = MilestoneModel.fromJson({'id': 1, 'projectId': 5, 'title': '设计'});
      expect(m.status, 'pending');
      expect(m.dueDate, isNull);
    });

    test('fromJson 全字段', () {
      final m = MilestoneModel.fromJson({
        'id': 1,
        'projectId': 5,
        'title': '设计',
        'dueDate': '2026-02-01',
        'status': 'done',
      });
      expect(m.dueDate, '2026-02-01');
      expect(m.status, 'done');
    });
  });

  group('ProjectTaskModel', () {
    test('fromJson 可选字段默认', () {
      final t = ProjectTaskModel.fromJson({'id': 1, 'projectId': 5, 'title': '开发'});
      expect(t.description, isNull);
      expect(t.dueDate, isNull);
      expect(t.status, 'pending');
    });

    test('fromJson 全字段', () {
      final t = ProjectTaskModel.fromJson({
        'id': 1,
        'projectId': 5,
        'title': '开发',
        'description': '核心模块',
        'dueDate': '2026-03-01',
        'status': 'in_progress',
      });
      expect(t.description, '核心模块');
      expect(t.status, 'in_progress');
    });
  });

  group('ProjectRiskModel', () {
    test('fromJson 默认 level=medium', () {
      final r = ProjectRiskModel.fromJson({'id': 1, 'projectId': 5, 'reason': '人力不足'});
      expect(r.level, 'medium');
      expect(r.reason, '人力不足');
    });

    test('fromJson 全字段', () {
      final r = ProjectRiskModel.fromJson({'id': 1, 'projectId': 5, 'level': 'high', 'reason': '延期'});
      expect(r.level, 'high');
    });
  });

  group('ProjectDetailModel', () {
    test('fromJson 聚合 project + 子资源 + memberCount', () {
      final d = ProjectDetailModel.fromJson({
        'project': {'id': 1, 'name': '官网改版'},
        'milestones': [
          {'id': 1, 'projectId': 1, 'title': '设计'},
        ],
        'tasks': [
          {'id': 1, 'projectId': 1, 'title': '开发'},
        ],
        'risks': [
          {'id': 1, 'projectId': 1, 'reason': '人力不足'},
        ],
        'memberCount': 6,
      });
      expect(d.project.name, '官网改版');
      expect(d.milestones.single.title, '设计');
      expect(d.tasks.single.title, '开发');
      expect(d.risks.single.reason, '人力不足');
      expect(d.memberCount, 6);
    });

    test('缺失子资源回退空列表', () {
      final d = ProjectDetailModel.fromJson({'project': {'id': 1, 'name': 'x'}});
      expect(d.milestones, isEmpty);
      expect(d.tasks, isEmpty);
      expect(d.risks, isEmpty);
      expect(d.memberCount, 0);
    });
  });

  group('ProjectRiskAnalysis', () {
    test('fromJson 解析', () {
      final a = ProjectRiskAnalysis.fromJson({'level': 'high', 'score': 90, 'reasons': ['延期']});
      expect(a.level, 'high');
      expect(a.score, 90);
      expect(a.reasons, ['延期']);
    });

    test('缺省默认', () {
      final a = ProjectRiskAnalysis.fromJson({});
      expect(a.level, 'low');
      expect(a.score, 0);
      expect(a.reasons, isEmpty);
    });
  });
}
