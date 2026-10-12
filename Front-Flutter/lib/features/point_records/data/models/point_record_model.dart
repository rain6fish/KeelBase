// SPDX-License-Identifier: Apache-2.0

class PointRecordModel {
  final int id;
  final int points;
  final String? checkinDate;
  final String reason;
  final String? description;

  const PointRecordModel({
    required this.id,
    required this.points,
    this.checkinDate,
    required this.reason,
    this.description,
  });

  factory PointRecordModel.fromJson(Map<String, dynamic> json) {
    return PointRecordModel(
      id: json['id'] as int? ?? 0,
      points: json['points'] as int? ?? 0,
      checkinDate: json['checkinDate'] as String?,
      reason: (json['reason'] as String? ?? '').trim(),
      description: json['description'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'points': points,
        'checkinDate': checkinDate,
        'reason': reason,
        'description': description,
      };

  PointRecordModel copyWith({
    Object? points = const Object(),
    Object? checkinDate = const Object(),
    Object? reason = const Object(),
    Object? description = const Object()
  }) {
    return PointRecordModel(
      id: id,
      points: points == const Object() ? this.points : points as dynamic,
      checkinDate: checkinDate == const Object() ? this.checkinDate : checkinDate as dynamic,
      reason: reason == const Object() ? this.reason : reason as dynamic,
      description: description == const Object() ? this.description : description as dynamic,
    );
  }
}
