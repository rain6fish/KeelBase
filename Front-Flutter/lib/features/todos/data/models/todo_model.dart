// SPDX-License-Identifier: Apache-2.0

class TodoModel {
  final int id;
  final String title;
  final String? description;
  final bool completed;
  final String? dueDate;

  const TodoModel({
    required this.id,
    required this.title,
    this.description,
    this.completed = false,
    this.dueDate,
  });

  factory TodoModel.fromJson(Map<String, dynamic> json) {
    return TodoModel(
      id: json['id'] as int,
      title: json['title'] as String,
      description: json['description'] as String?,
      completed: json['completed'] as bool? ?? false,
      dueDate: json['dueDate'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'completed': completed,
        'dueDate': dueDate,
      };

  TodoModel copyWith({bool? completed}) {
    return TodoModel(
      id: id,
      title: title,
      description: description,
      completed: completed ?? this.completed,
      dueDate: dueDate,
    );
  }
}
