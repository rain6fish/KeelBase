// SPDX-License-Identifier: Apache-2.0

class BookModel {
  final int id;
  final String title;
  final String? author;
  final String status;
  final int? rating;

  const BookModel({
    required this.id,
    required this.title,
    this.author,
    this.status = 'unread',
    this.rating,
  });

  factory BookModel.fromJson(Map<String, dynamic> json) {
    return BookModel(
      id: json['id'] as int? ?? 0,
      title: (json['title'] as String? ?? '').trim(),
      author: json['author'] as String?,
      status: json['status'] as String? ?? 'unread',
      rating: json['rating'] as int?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'author': author,
        'status': status,
        'rating': rating,
      };

  BookModel copyWith({
    Object? title = const Object(),
    Object? author = const Object(),
    Object? status = const Object(),
    Object? rating = const Object()
  }) {
    return BookModel(
      id: id,
      title: title == const Object() ? this.title : title as dynamic,
      author: author == const Object() ? this.author : author as dynamic,
      status: status == const Object() ? this.status : status as dynamic,
      rating: rating == const Object() ? this.rating : rating as dynamic,
    );
  }
}
