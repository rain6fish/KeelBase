class NoteModel {
  final int id;
  final String title;
  final String? content;
  final String category;

  const NoteModel({
    required this.id,
    required this.title,
    this.content,
    this.category = 'work',
  });

  factory NoteModel.fromJson(Map<String, dynamic> json) {
    return NoteModel(
      id: json['id'] as int,
      title: json['title'] as String,
      content: json['content'] as String?,
      category: json['category'] as String? ?? 'work',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'content': content,
        'category': category,
      };

  NoteModel copyWith({
    title = const Object(),
    content = const Object(),
    category = const Object(),
  }) {
    return NoteModel(
      id: id,
      title: title == const Object() ? this.title : title as dynamic,
      content: content == const Object() ? this.content : content as dynamic,
      category: category == const Object() ? this.category : category as dynamic,
    );
  }
}
