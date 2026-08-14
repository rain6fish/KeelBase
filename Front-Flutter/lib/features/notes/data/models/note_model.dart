class NoteModel {
  final int id;
  final String title;
  final String? content;

  const NoteModel({
    required this.id,
    required this.title,
    this.content,
  });

  factory NoteModel.fromJson(Map<String, dynamic> json) {
    return NoteModel(
      id: json['id'] as int,
      title: json['title'] as String,
      content: json['content'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'content': content,
      };

  NoteModel copyWith({
    title = const Object(),
    content = const Object()
  }) {
    return NoteModel(
      id: id,
      title: title == const Object() ? this.title : title as dynamic,
      content: content == const Object() ? this.content : content as dynamic,
    );
  }
}
