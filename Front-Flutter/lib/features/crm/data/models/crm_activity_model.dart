/// AI CRM：跟进记录模型
class CrmActivityModel {
  final int id;
  final int customerId;
  final String type;
  final String summary;
  final String? happenedAt;

  const CrmActivityModel({
    required this.id,
    required this.customerId,
    this.type = 'note',
    required this.summary,
    this.happenedAt,
  });

  factory CrmActivityModel.fromJson(Map<String, dynamic> json) => CrmActivityModel(
        id: json['id'] as int,
        customerId: json['customerId'] as int,
        type: json['type'] as String? ?? 'note',
        summary: json['summary'] as String? ?? '',
        happenedAt: json['happenedAt'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerId': customerId,
        'type': type,
        'summary': summary,
        'happenedAt': happenedAt,
      };
}
