/// AI CRM：跟进任务模型（AI 写工具 create_followup_task 的目标）
class CrmTaskModel {
  final int id;
  final int? customerId;
  final String title;
  final String? description;
  final String? dueDate;
  final String status;

  const CrmTaskModel({
    required this.id,
    this.customerId,
    required this.title,
    this.description,
    this.dueDate,
    this.status = 'pending',
  });

  factory CrmTaskModel.fromJson(Map<String, dynamic> json) => CrmTaskModel(
        id: json['id'] as int,
        customerId: json['customerId'] as int?,
        title: json['title'] as String? ?? '',
        description: json['description'] as String?,
        dueDate: json['dueDate'] as String?,
        status: json['status'] as String? ?? 'pending',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerId': customerId,
        'title': title,
        'description': description,
        'dueDate': dueDate,
        'status': status,
      };
}
