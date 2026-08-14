/// 审批待办任务（FLOW-7：GET /flows/tasks 返回，含节点名/流程名）。
class FlowTaskModel {
  final int id;
  final int instanceId;
  final String nodeId;
  final String? title;
  final String? flowName;
  final String? createdAt;

  const FlowTaskModel({
    required this.id,
    required this.instanceId,
    required this.nodeId,
    this.title,
    this.flowName,
    this.createdAt,
  });

  factory FlowTaskModel.fromJson(Map<String, dynamic> json) {
    return FlowTaskModel(
      id: json['id'] as int,
      instanceId: json['instanceId'] as int,
      nodeId: json['nodeId'] as String,
      title: json['title'] as String?,
      flowName: json['flowName'] as String?,
      createdAt: json['createdAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'instanceId': instanceId,
        'nodeId': nodeId,
        if (title != null) 'title': title,
        if (flowName != null) 'flowName': flowName,
        if (createdAt != null) 'createdAt': createdAt,
      };
}
