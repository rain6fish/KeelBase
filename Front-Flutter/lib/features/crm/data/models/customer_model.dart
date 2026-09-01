// SPDX-License-Identifier: Apache-2.0

/// AI CRM：客户模型
class CustomerModel {
  final int id;
  final String name;
  final String? email;
  final String? phone;
  final String? company;
  final String status;
  final String riskLevel;
  final String? notes;
  final String? createdAt;

  const CustomerModel({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.company,
    this.status = 'lead',
    this.riskLevel = 'low',
    this.notes,
    this.createdAt,
  });

  factory CustomerModel.fromJson(Map<String, dynamic> json) => CustomerModel(
        id: json['id'] as int,
        name: json['name'] as String,
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        company: json['company'] as String?,
        status: json['status'] as String? ?? 'lead',
        riskLevel: json['riskLevel'] as String? ?? 'low',
        notes: json['notes'] as String?,
        createdAt: json['createdAt'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'company': company,
        'status': status,
        'riskLevel': riskLevel,
        'notes': notes,
      };

  CustomerModel copyWith({
    Object? name = const Object(),
    Object? email = const Object(),
    Object? phone = const Object(),
    Object? company = const Object(),
    Object? status = const Object(),
    Object? riskLevel = const Object(),
    Object? notes = const Object(),
  }) =>
      CustomerModel(
        id: id,
        name: name is String ? name : this.name,
        email: email is String ? email : this.email,
        phone: phone is String ? phone : this.phone,
        company: company is String ? company : this.company,
        status: status is String ? status : this.status,
        riskLevel: riskLevel is String ? riskLevel : this.riskLevel,
        notes: notes is String ? notes : this.notes,
        createdAt: createdAt,
      );
}
