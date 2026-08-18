class ContractModel {
  final int id;
  final String name;
  final String counterparty;
  final String status;
  final int? amount;

  const ContractModel({
    required this.id,
    required this.name,
    required this.counterparty,
    this.status = 'draft',
    this.amount,
  });

  factory ContractModel.fromJson(Map<String, dynamic> json) {
    return ContractModel(
      id: json['id'] as int,
      name: json['name'] as String,
      counterparty: json['counterparty'] as String,
      status: json['status'] as String? ?? 'draft',
      amount: json['amount'] as int?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'counterparty': counterparty,
        'status': status,
        'amount': amount,
      };

  ContractModel copyWith({
    name = const Object(),
    counterparty = const Object(),
    status = const Object(),
    amount = const Object()
  }) {
    return ContractModel(
      id: id,
      name: name == const Object() ? this.name : name as dynamic,
      counterparty: counterparty == const Object() ? this.counterparty : counterparty as dynamic,
      status: status == const Object() ? this.status : status as dynamic,
      amount: amount == const Object() ? this.amount : amount as dynamic,
    );
  }
}
