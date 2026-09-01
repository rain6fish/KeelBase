// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/flows/data/models/flow_task_model.dart';

void main() {
  test('fromJson 解析审批任务', () {
    final t = FlowTaskModel.fromJson({
      'id': 1,
      'instanceId': 10,
      'nodeId': 'approve',
      'title': '请假审批',
      'flowName': '请假流程',
    });
    expect(t.id, 1);
    expect(t.instanceId, 10);
    expect(t.nodeId, 'approve');
    expect(t.title, '请假审批');
  });

  test('toJson 省略空可选字段', () {
    final t = FlowTaskModel(id: 1, instanceId: 2, nodeId: 'n');
    expect(t.toJson(), {'id': 1, 'instanceId': 2, 'nodeId': 'n'});
  });
}
