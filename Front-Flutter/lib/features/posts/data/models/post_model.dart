// SPDX-License-Identifier: Apache-2.0

class PostModel {
  final int id;
  final String title;
  final String? content;
  final int likes;
  final int comments;
  final bool likedByMe;

  const PostModel({
    required this.id,
    required this.title,
    this.content,
    this.likes = 0,
    this.comments = 0,
    this.likedByMe = false,
  });

  factory PostModel.fromJson(Map<String, dynamic> json) {
    return PostModel(
      id: json['id'] as int,
      title: json['title'] as String,
      content: json['content'] as String?,
      likes: json['likes'] as int? ?? 0,
      comments: json['comments'] as int? ?? 0,
      likedByMe: json['likedByMe'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'content': content,
        'likes': likes,
        'comments': comments,
        'likedByMe': likedByMe,
      };

  PostModel copyWith({
    Object? title = const Object(),
    Object? content = const Object(),
    int? likes,
    int? comments,
    bool? likedByMe,
  }) {
    return PostModel(
      id: id,
      title: title == const Object() ? this.title : title as String,
      content: content == const Object() ? this.content : content as String?,
      likes: likes ?? this.likes,
      comments: comments ?? this.comments,
      likedByMe: likedByMe ?? this.likedByMe,
    );
  }
}
