import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/tags/data/models/tag_model.dart';

void main() {
  test('fromJson / toJson 往返', () {
    final tag = TagModel.fromJson({'id': 1, 'name': '工作'});
    expect(tag.id, 1);
    expect(tag.name, '工作');
    expect(tag.toJson(), {'id': 1, 'name': '工作'});
  });

  test('copyWith', () {
    final tag = TagModel(id: 1, name: 'A');
    expect(tag.copyWith(name: 'B').name, 'B');
    expect(tag.copyWith().name, 'A');
  });
}
