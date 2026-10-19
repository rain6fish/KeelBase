// SPDX-License-Identifier: Apache-2.0

class InventoryMovementModel {
  final int id;
  final String documentNo;
  final String sku;
  final String itemName;
  final String direction;
  final int quantity;
  final String? unit;
  final String? partner;
  final String? occurredAt;
  final String? note;

  const InventoryMovementModel({
    required this.id,
    required this.documentNo,
    required this.sku,
    required this.itemName,
    required this.direction,
    required this.quantity,
    this.unit,
    this.partner,
    this.occurredAt,
    this.note,
  });

  factory InventoryMovementModel.fromJson(Map<String, dynamic> json) {
    return InventoryMovementModel(
      id: json['id'] as int? ?? 0,
      documentNo: (json['documentNo'] as String? ?? '').trim(),
      sku: (json['sku'] as String? ?? '').trim(),
      itemName: (json['itemName'] as String? ?? '').trim(),
      direction: (json['direction'] as String? ?? '').trim(),
      quantity: json['quantity'] as int? ?? 0,
      unit: json['unit'] as String?,
      partner: json['partner'] as String?,
      occurredAt: json['occurredAt'] as String?,
      note: json['note'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'documentNo': documentNo,
        'sku': sku,
        'itemName': itemName,
        'direction': direction,
        'quantity': quantity,
        'unit': unit,
        'partner': partner,
        'occurredAt': occurredAt,
        'note': note,
      };

  InventoryMovementModel copyWith({
    Object? documentNo = const Object(),
    Object? sku = const Object(),
    Object? itemName = const Object(),
    Object? direction = const Object(),
    Object? quantity = const Object(),
    Object? unit = const Object(),
    Object? partner = const Object(),
    Object? occurredAt = const Object(),
    Object? note = const Object()
  }) {
    return InventoryMovementModel(
      id: id,
      documentNo: documentNo == const Object() ? this.documentNo : documentNo as dynamic,
      sku: sku == const Object() ? this.sku : sku as dynamic,
      itemName: itemName == const Object() ? this.itemName : itemName as dynamic,
      direction: direction == const Object() ? this.direction : direction as dynamic,
      quantity: quantity == const Object() ? this.quantity : quantity as dynamic,
      unit: unit == const Object() ? this.unit : unit as dynamic,
      partner: partner == const Object() ? this.partner : partner as dynamic,
      occurredAt: occurredAt == const Object() ? this.occurredAt : occurredAt as dynamic,
      note: note == const Object() ? this.note : note as dynamic,
    );
  }
}
