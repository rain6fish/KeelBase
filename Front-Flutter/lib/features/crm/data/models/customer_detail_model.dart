import 'customer_model.dart';
import 'crm_order_model.dart';
import 'crm_activity_model.dart';
import 'crm_task_model.dart';
import 'crm_risk_model.dart';

/// 客户详情聚合（GET /crm/customers/:id 一次返回）
class CustomerDetailModel {
  final CustomerModel customer;
  final List<CrmOrderModel> orders;
  final List<CrmActivityModel> activities;
  final List<CrmTaskModel> tasks;
  final List<CrmRiskModel> risks;

  const CustomerDetailModel({
    required this.customer,
    this.orders = const [],
    this.activities = const [],
    this.tasks = const [],
    this.risks = const [],
  });

  factory CustomerDetailModel.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) from) =>
        (json[key] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(from)
            .toList();
    return CustomerDetailModel(
      customer: CustomerModel.fromJson(json['customer'] as Map<String, dynamic>),
      orders: list('orders', CrmOrderModel.fromJson),
      activities: list('activities', CrmActivityModel.fromJson),
      tasks: list('tasks', CrmTaskModel.fromJson),
      risks: list('risks', CrmRiskModel.fromJson),
    );
  }
}

/// 风险分析结果（GET /crm/customers/:id/analyze）
class RiskAnalysisModel {
  final String level;
  final int score;
  final List<String> reasons;

  const RiskAnalysisModel({required this.level, this.score = 0, this.reasons = const []});

  factory RiskAnalysisModel.fromJson(Map<String, dynamic> json) => RiskAnalysisModel(
        level: json['level'] as String? ?? 'low',
        score: json['score'] as int? ?? 0,
        reasons: (json['reasons'] as List? ?? []).whereType<String>().toList(),
      );
}
