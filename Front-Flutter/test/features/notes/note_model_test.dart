import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/notes/data/models/note_model.dart';

void main() {
  test('fromJson 解析并容忍 content 为 null', () {
    final note = NoteModel.fromJson({'id': 1, 'title': '会议'});
    expect(note.id, 1);
    expect(note.content, isNull);
    final full = NoteModel.fromJson({'id': 2, 'title': 'T', 'content': '正文'});
    expect(full.content, '正文');
  });

  test('toJson 往返', () {
    final note = NoteModel(id: 3, title: 'T', content: 'C');
    expect(note.toJson(), {'id': 3, 'title': 'T', 'content': 'C'});
  });
}
