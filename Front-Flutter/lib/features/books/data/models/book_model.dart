class BookModel {
  final int id;
  final String title;
  final String author;

  const BookModel({
    required this.id,
    required this.title,
    required this.author,
  });

  factory BookModel.fromJson(Map<String, dynamic> json) {
    return BookModel(
      id: json['id'] as int? ?? 0,
      title: (json['title'] as String? ?? '').trim(),
      author: (json['author'] as String? ?? '').trim(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'author': author,
      };

  BookModel copyWith({int? id, String? title, String? author}) {
    return BookModel(
      id: id ?? this.id,
      title: title ?? this.title,
      author: author ?? this.author,
    );
  }
}
