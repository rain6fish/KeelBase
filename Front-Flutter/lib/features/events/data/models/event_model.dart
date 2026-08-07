enum EventColorRole { blue, red, green, orange, purple, cyan }

class EventModel {
  final int id;
  final String title;
  final String? description;
  final DateTime startTime;
  final DateTime endTime;
  final String? location;
  final EventColorRole colorRole;
  final bool isCancelled;
  final bool isRecurring;
  final int? reminderMinutes;
  final DateTime createdAt;
  final DateTime updatedAt;

  EventModel({
    required this.id,
    required this.title,
    this.description,
    required this.startTime,
    required this.endTime,
    this.location,
    this.colorRole = EventColorRole.blue,
    this.isCancelled = false,
    this.isRecurring = false,
    this.reminderMinutes,
    required this.createdAt,
    required this.updatedAt,
  });

  factory EventModel.fromJson(Map<String, dynamic> json) {
    return EventModel(
      id: json['id'] as int,
      title: json['title'] as String,
      description: json['description'] as String?,
      startTime: DateTime.parse(json['startTime'] as String),
      endTime: DateTime.parse(json['endTime'] as String),
      location: json['location'] as String?,
      colorRole: EventColorRole.values.firstWhere(
        (e) => e.index == (json['colorRole'] as int? ?? 0),
        orElse: () => EventColorRole.blue,
      ),
      isCancelled: json['isCancelled'] as bool? ?? false,
      isRecurring: json['isRecurring'] as bool? ?? false,
      reminderMinutes: json['reminderMinutes'] as int?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'startTime': startTime.toIso8601String(),
        'endTime': endTime.toIso8601String(),
        'location': location,
        'colorRole': colorRole.index,
        'isCancelled': isCancelled,
        'isRecurring': isRecurring,
        'reminderMinutes': reminderMinutes,
      };

  // Color role index maps to widget colors in the UI layer.

}
