/// AI CRM：订单模型
class CrmOrderModel {
  final int id;
  final int customerId;
  final double amount;
  final String status;
  final String? orderDate;
  final String? dueDate;

  const CrmOrderModel({
    required this.id,
    required this.customerId,
    this.amount = 0,
    this.status = 'pending',
    this.orderDate,
    this.dueDate,
  });

  factory CrmOrderModel.fromJson(Map<String, dynamic> json) => CrmOrderModel(
        id: json['id'] as int,
        customerId: json['customerId'] as int,
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
        status: json['status'] as String? ?? 'pending',
        orderDate: json['orderDate'] as String?,
        dueDate: json['dueDate'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerId': customerId,
        'amount': amount,
        'status': status,
        'orderDate': orderDate,
        'dueDate': dueDate,
      };
}
