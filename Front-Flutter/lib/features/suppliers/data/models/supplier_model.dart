// SPDX-License-Identifier: Apache-2.0

class SupplierModel {
  final int id;
  final String name;
  final String contact;
  final String status;
  final String riskLevel;
  final int? annualSpend;

  const SupplierModel({
    required this.id,
    required this.name,
    required this.contact,
    this.status = 'active',
    this.riskLevel = 'low',
    this.annualSpend,
  });

  factory SupplierModel.fromJson(Map<String, dynamic> json) {
    return SupplierModel(
      id: json['id'] as int,
      name: json['name'] as String,
      contact: json['contact'] as String,
      status: json['status'] as String? ?? 'active',
      riskLevel: json['riskLevel'] as String? ?? 'low',
      annualSpend: json['annualSpend'] as int?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'contact': contact,
        'status': status,
        'riskLevel': riskLevel,
        'annualSpend': annualSpend,
      };

  SupplierModel copyWith({
    name = const Object(),
    contact = const Object(),
    status = const Object(),
    riskLevel = const Object(),
    annualSpend = const Object()
  }) {
    return SupplierModel(
      id: id,
      name: name == const Object() ? this.name : name as dynamic,
      contact: contact == const Object() ? this.contact : contact as dynamic,
      status: status == const Object() ? this.status : status as dynamic,
      riskLevel: riskLevel == const Object() ? this.riskLevel : riskLevel as dynamic,
      annualSpend: annualSpend == const Object() ? this.annualSpend : annualSpend as dynamic,
    );
  }
}
