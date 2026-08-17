/// AI CRM：风险记录模型
class CrmRiskModel {
  final int id;
  final int customerId;
  final String level;
  final String reason;
  final String? detectedAt;
  final String? resolvedAt;

  const CrmRiskModel({
    required this.id,
    required this.customerId,
    this.level = 'medium',
    required this.reason,
    this.detectedAt,
    this.resolvedAt,
  });

  factory CrmRiskModel.fromJson(Map<String, dynamic> json) => CrmRiskModel(
        id: json['id'] as int,
        customerId: json['customerId'] as int,
        level: json['level'] as String? ?? 'medium',
        reason: json['reason'] as String? ?? '',
        detectedAt: json['detectedAt'] as String?,
        resolvedAt: json['resolvedAt'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerId': customerId,
        'level': level,
        'reason': reason,
        'detectedAt': detectedAt,
        'resolvedAt': resolvedAt,
      };
}
