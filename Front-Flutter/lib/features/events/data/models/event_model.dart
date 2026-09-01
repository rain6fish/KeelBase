// SPDX-License-Identifier: Apache-2.0

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
  }) : assert(
          !endTime.isBefore(startTime),
          'EventModel endTime must not be before startTime',
        );

  factory EventModel.fromJson(Map<String, dynamic> json) {
    return EventModel(
      id: json['id'] as int? ?? 0,
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      startTime: _parseDate(json, 'startTime'),
      endTime: _parseDate(json, 'endTime'),
      location: json['location'] as String?,
      colorRole: EventColorRole.values.firstWhere(
        (e) => e.index == (json['colorRole'] as int? ?? 0),
        orElse: () => EventColorRole.blue,
      ),
      isCancelled: json['isCancelled'] as bool? ?? false,
      isRecurring: json['isRecurring'] as bool? ?? false,
      reminderMinutes: json['reminderMinutes'] as int?,
      createdAt: _parseDate(json, 'createdAt'),
      updatedAt: _parseDate(json, 'updatedAt'),
    );
  }

  static DateTime _parseDate(Map<String, dynamic> json, String key) {
    final raw = json[key];
    if (raw is! String) {
      throw FormatException('EventModel.$key must be an ISO-8601 string, got: $raw');
    }
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) {
      throw FormatException('EventModel.$key is not a valid date: $raw');
    }
    return parsed;
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
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  // Color role index maps to widget colors in the UI layer.

}
