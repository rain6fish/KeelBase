// SPDX-License-Identifier: Apache-2.0

class ReportModel {
  final int id;
  final String title;
  final String? summary;
  final String status;
  final int? amount;

  const ReportModel({
    required this.id,
    required this.title,
    this.summary,
    this.status = 'draft',
    this.amount,
  });

  factory ReportModel.fromJson(Map<String, dynamic> json) {
    return ReportModel(
      id: json['id'] as int,
      title: json['title'] as String,
      summary: json['summary'] as String?,
      status: json['status'] as String? ?? 'draft',
      amount: json['amount'] as int?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'summary': summary,
        'status': status,
        'amount': amount,
      };

  ReportModel copyWith({
    Object? title = const Object(),
    Object? summary = const Object(),
    Object? status = const Object(),
    Object? amount = const Object()
  }) {
    return ReportModel(
      id: id,
      title: title == const Object() ? this.title : title as dynamic,
      summary: summary == const Object() ? this.summary : summary as dynamic,
      status: status == const Object() ? this.status : status as dynamic,
      amount: amount == const Object() ? this.amount : amount as dynamic,
    );
  }
}
