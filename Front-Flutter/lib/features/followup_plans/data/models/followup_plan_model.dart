// SPDX-License-Identifier: Apache-2.0

class FollowupPlanModel {
  final int id;
  final String title;
  final String priority;
  final String? reason;
  final String? dueDate;
  final String status;

  const FollowupPlanModel({
    required this.id,
    required this.title,
    this.priority = 'low',
    this.reason,
    this.dueDate,
    this.status = 'planned',
  });

  factory FollowupPlanModel.fromJson(Map<String, dynamic> json) {
    return FollowupPlanModel(
      id: json['id'] as int,
      title: json['title'] as String,
      priority: json['priority'] as String? ?? 'low',
      reason: json['reason'] as String?,
      dueDate: json['dueDate'] as String?,
      status: json['status'] as String? ?? 'planned',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'priority': priority,
        'reason': reason,
        'dueDate': dueDate,
        'status': status,
      };

  FollowupPlanModel copyWith({
    Object? title = const Object(),
    Object? priority = const Object(),
    Object? reason = const Object(),
    Object? dueDate = const Object(),
    Object? status = const Object()
  }) {
    return FollowupPlanModel(
      id: id,
      title: title == const Object() ? this.title : title as dynamic,
      priority: priority == const Object() ? this.priority : priority as dynamic,
      reason: reason == const Object() ? this.reason : reason as dynamic,
      dueDate: dueDate == const Object() ? this.dueDate : dueDate as dynamic,
      status: status == const Object() ? this.status : status as dynamic,
    );
  }
}
