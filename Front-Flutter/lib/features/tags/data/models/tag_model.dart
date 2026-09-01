// SPDX-License-Identifier: Apache-2.0

class TagModel {
  final int id;
  final String name;

  const TagModel({
    required this.id,
    required this.name,
  });

  factory TagModel.fromJson(Map<String, dynamic> json) {
    return TagModel(
      id: json['id'] as int,
      name: json['name'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
      };

  TagModel copyWith({
    name = const Object()
  }) {
    return TagModel(
      id: id,
      name: name == const Object() ? this.name : name as dynamic,
    );
  }
}
