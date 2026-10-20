// SPDX-License-Identifier: Apache-2.0

class LeaveRequestModel {
  final int id;
  final String requestNo;
  final String leaveType;
  final String startDate;
  final String endDate;
  final int days;
  final String? reason;
  final String status;

  const LeaveRequestModel({
    required this.id,
    required this.requestNo,
    required this.leaveType,
    required this.startDate,
    required this.endDate,
    required this.days,
    this.reason,
    this.status = 'pending',
  });

  factory LeaveRequestModel.fromJson(Map<String, dynamic> json) {
    return LeaveRequestModel(
      id: json['id'] as int? ?? 0,
      requestNo: (json['requestNo'] as String? ?? '').trim(),
      leaveType: (json['leaveType'] as String? ?? '').trim(),
      startDate: (json['startDate'] as String? ?? '').trim(),
      endDate: (json['endDate'] as String? ?? '').trim(),
      days: json['days'] as int? ?? 0,
      reason: json['reason'] as String?,
      status: json['status'] as String? ?? 'pending',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'requestNo': requestNo,
        'leaveType': leaveType,
        'startDate': startDate,
        'endDate': endDate,
        'days': days,
        'reason': reason,
        'status': status,
      };

  LeaveRequestModel copyWith({
    Object? requestNo = const Object(),
    Object? leaveType = const Object(),
    Object? startDate = const Object(),
    Object? endDate = const Object(),
    Object? days = const Object(),
    Object? reason = const Object(),
    Object? status = const Object()
  }) {
    return LeaveRequestModel(
      id: id,
      requestNo: requestNo == const Object() ? this.requestNo : requestNo as dynamic,
      leaveType: leaveType == const Object() ? this.leaveType : leaveType as dynamic,
      startDate: startDate == const Object() ? this.startDate : startDate as dynamic,
      endDate: endDate == const Object() ? this.endDate : endDate as dynamic,
      days: days == const Object() ? this.days : days as dynamic,
      reason: reason == const Object() ? this.reason : reason as dynamic,
      status: status == const Object() ? this.status : status as dynamic,
    );
  }
}
