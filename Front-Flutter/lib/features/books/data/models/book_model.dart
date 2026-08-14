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
      id: json['id'] as int,
      title: json['title'] as String,
      author: json['author'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'author': author,
      };

  BookModel copyWith({
    title = const Object(),
    author = const Object()
  }) {
    return BookModel(
      id: id,
      title: title == const Object() ? this.title : title as dynamic,
      author: author == const Object() ? this.author : author as dynamic,
    );
  }
}
