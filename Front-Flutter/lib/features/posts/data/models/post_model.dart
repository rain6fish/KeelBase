class PostModel {
  final int id;
  final String title;
  final String? content;

  const PostModel({
    required this.id,
    required this.title,
    this.content,
  });

  factory PostModel.fromJson(Map<String, dynamic> json) {
    return PostModel(
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

  PostModel copyWith({
    title = const Object(),
    content = const Object()
  }) {
    return PostModel(
      id: id,
      title: title == const Object() ? this.title : title as dynamic,
      content: content == const Object() ? this.content : content as dynamic,
    );
  }
}
