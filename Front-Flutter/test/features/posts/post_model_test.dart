import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/posts/data/models/post_model.dart';

void main() {
  test('fromJson 解析并回退默认值', () {
    final p = PostModel.fromJson({'id': 1, 'title': '帖', 'content': '正文', 'likes': 3, 'comments': 1, 'likedByMe': true});
    expect(p.id, 1);
    expect(p.likes, 3);
    expect(p.likedByMe, isTrue);

    final minimal = PostModel.fromJson({'id': 2, 'title': 'x'});
    expect(minimal.likes, 0);
    expect(minimal.comments, 0);
    expect(minimal.likedByMe, isFalse);
  });

  test('toJson 往返', () {
    final p = PostModel(id: 1, title: 'T', content: 'C', likes: 2, comments: 0, likedByMe: false);
    expect(p.toJson(), {
      'id': 1,
      'title': 'T',
      'content': 'C',
      'likes': 2,
      'comments': 0,
      'likedByMe': false,
    });
  });
}
