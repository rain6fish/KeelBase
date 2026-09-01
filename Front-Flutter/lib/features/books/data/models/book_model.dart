// SPDX-License-Identifier: Apache-2.0

class BookModel {
  final int id;
  final String title;
  final String author;
  final String status;
  final int? rating;

  const BookModel({
    required this.id,
    required this.title,
    required this.author,
    this.status = 'unread',
    this.rating,
  });

  factory BookModel.fromJson(Map<String, dynamic> json) {
    return BookModel(
      id: json['id'] as int? ?? 0,
      title: (json['title'] as String? ?? '').trim(),
      author: (json['author'] as String? ?? '').trim(),
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

  BookModel copyWith({int? id, String? title, String? author, String? status, int? rating}) {
    return BookModel(
      id: id ?? this.id,
      title: title ?? this.title,
      author: author ?? this.author,
      status: status ?? this.status,
      rating: rating ?? this.rating,
    );
  }
}
