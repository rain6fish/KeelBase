// SPDX-License-Identifier: Apache-2.0

class AssetLoanModel {
  final int id;
  final String assetName;
  final String assetTag;
  final String? purpose;
  final String? dueDate;
  final String status;

  const AssetLoanModel({
    required this.id,
    required this.assetName,
    required this.assetTag,
    this.purpose,
    this.dueDate,
    this.status = 'active',
  });

  factory AssetLoanModel.fromJson(Map<String, dynamic> json) {
    return AssetLoanModel(
      id: json['id'] as int? ?? 0,
      assetName: (json['assetName'] as String? ?? '').trim(),
      assetTag: (json['assetTag'] as String? ?? '').trim(),
      purpose: json['purpose'] as String?,
      dueDate: json['dueDate'] as String?,
      status: json['status'] as String? ?? 'active',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'assetName': assetName,
        'assetTag': assetTag,
        'purpose': purpose,
        'dueDate': dueDate,
        'status': status,
      };

  AssetLoanModel copyWith({
    Object? assetName = const Object(),
    Object? assetTag = const Object(),
    Object? purpose = const Object(),
    Object? dueDate = const Object(),
    Object? status = const Object()
  }) {
    return AssetLoanModel(
      id: id,
      assetName: assetName == const Object() ? this.assetName : assetName as dynamic,
      assetTag: assetTag == const Object() ? this.assetTag : assetTag as dynamic,
      purpose: purpose == const Object() ? this.purpose : purpose as dynamic,
      dueDate: dueDate == const Object() ? this.dueDate : dueDate as dynamic,
      status: status == const Object() ? this.status : status as dynamic,
    );
  }
}
