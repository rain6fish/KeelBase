/// AI Approval：审批请求模型
class ApprovalRequestModel {
  final int id;
  final String title;
  final String type;
  final double amount;
  final String reason;
  final String status;
  final String riskLevel;
  final String? aiRecommendation;
  final String? createdAt;

  const ApprovalRequestModel({
    required this.id,
    required this.title,
    this.type = 'general',
    this.amount = 0,
    required this.reason,
    this.status = 'pending',
    this.riskLevel = 'low',
    this.aiRecommendation,
    this.createdAt,
  });

  factory ApprovalRequestModel.fromJson(Map<String, dynamic> json) => ApprovalRequestModel(
        id: json['id'] as int,
        title: json['title'] as String? ?? '',
        type: json['type'] as String? ?? 'general',
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
        reason: json['reason'] as String? ?? '',
        status: json['status'] as String? ?? 'pending',
        riskLevel: json['riskLevel'] as String? ?? 'low',
        aiRecommendation: json['aiRecommendation'] as String?,
        createdAt: json['createdAt'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'type': type,
        'amount': amount,
        'reason': reason,
        'status': status,
        'riskLevel': riskLevel,
        'aiRecommendation': aiRecommendation,
      };
}

/// 审批政策
class ApprovalPolicyModel {
  final int id;
  final String title;
  final String type;
  final double maxAmount;
  final String? description;
  final bool active;

  const ApprovalPolicyModel({
    required this.id,
    required this.title,
    this.type = 'general',
    this.maxAmount = 1000,
    this.description,
    this.active = true,
  });

  factory ApprovalPolicyModel.fromJson(Map<String, dynamic> json) => ApprovalPolicyModel(
        id: json['id'] as int,
        title: json['title'] as String? ?? '',
        type: json['type'] as String? ?? 'general',
        maxAmount: (json['maxAmount'] as num?)?.toDouble() ?? 1000,
        description: json['description'] as String?,
        active: json['active'] as bool? ?? true,
      );
}
