import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/features/notes/data/repositories/notes_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late NotesRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = NotesRepository(apiClient);
  });

  test('getNotes 解析列表并容忍 content 缺失', () async {
    when(() => apiClient.get('/notes')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': [
        {'id': 1, 'title': '会议记录', 'content': '……'},
        {'id': 2, 'title': '无正文笔记'},
      ],
      'timestamp': '',
    });

    final notes = await repository.getNotes();
    expect(notes, hasLength(2));
    expect(notes[0].content, '……');
    expect(notes[1].content, isNull);
  });

  test('create POST /notes 返回 NoteModel', () async {
    when(() => apiClient.post('/notes', data: any(named: 'data')))
        .thenAnswer((_) async => {
          'code': 200,
          'message': 'ok',
          'data': {'id': 3, 'title': '新笔记', 'content': '正文'},
          'timestamp': '',
        });
    final note = await repository.create({'title': '新笔记', 'content': '正文'});
    expect(note.id, 3);
    verify(() => apiClient.post('/notes', data: {'title': '新笔记', 'content': '正文'})).called(1);
  });

  test('delete DELETE /notes/:id', () async {
    when(() => apiClient.delete('/notes/7')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': null,
      'timestamp': '',
    });
    await repository.delete(7);
    verify(() => apiClient.delete('/notes/7')).called(1);
  });
}
