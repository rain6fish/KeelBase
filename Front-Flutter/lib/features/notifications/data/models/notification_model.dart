class NotificationModel {
  final int id;
  final String title;
  final String? body;
  final String type;
  final String? targetType;
  final String? targetId;
  final bool isRead;
  final String? link;
  final String? createdAt;

  const NotificationModel({
    required this.id,
    required this.title,
    this.body,
    this.type = 'system',
    this.targetType,
    this.targetId,
    this.isRead = false,
    this.link,
    this.createdAt,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    return NotificationModel(
      id: json['id'] as int,
      title: json['title'] as String,
      body: json['body'] as String?,
      type: json['type'] as String? ?? 'system',
      targetType: json['targetType'] as String?,
      targetId: json['targetId'] as String?,
      isRead: json['isRead'] as bool? ?? false,
      link: json['link'] as String?,
      createdAt: json['createdAt'] as String?,
    );
  }

  NotificationModel copyWith({bool? isRead}) {
    return NotificationModel(
      id: id,
      title: title,
      body: body,
      type: type,
      targetType: targetType,
      targetId: targetId,
      isRead: isRead ?? this.isRead,
      link: link,
      createdAt: createdAt,
    );
  }
}
