import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/notes/data/models/note_model.dart';
import 'package:front_app/features/notes/presentation/pages/notes_page.dart';
import 'package:front_app/features/notes/presentation/providers/notes_provider.dart';
import '../helpers.dart';

void main() {
  late MockNotesRepository repository;

  setUp(() {
    repository = MockNotesRepository();
    when(() => repository.getNotes()).thenAnswer((_) async => [
      NoteModel(id: 1, title: '会议记录', content: '……'),
      NoteModel(id: 2, title: '灵感'),
    ]);
  });

  Widget wrap() => wrapCupertinoPage(
        const NotesPage(),
        providers: [
          ChangeNotifierProvider<NotesProvider>(
            create: (_) => NotesProvider(repository),
          ),
        ],
      );

  testWidgets('渲染笔记列表', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('笔记'), findsOneWidget);
    expect(find.text('会议记录'), findsOneWidget);
    expect(find.text('灵感'), findsOneWidget);
  });
}
