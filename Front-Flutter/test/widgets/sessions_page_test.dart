import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/sessions/data/models/device_session_model.dart';
import 'package:front_app/features/sessions/presentation/pages/session_list_page.dart';
import 'package:front_app/features/sessions/presentation/providers/session_provider.dart';
import '../helpers.dart';

void main() {
  late MockSessionRepository repository;

  setUp(() {
    repository = MockSessionRepository();
    when(() => repository.getSessions()).thenAnswer((_) async => [
      DeviceSessionModel(id: 1, deviceName: 'iPhone 15', ip: '1.2.3.4', isCurrent: true),
      DeviceSessionModel(id: 2, deviceName: 'MacBook Pro', ip: '5.6.7.8'),
    ]);
  });

  Widget wrap() => wrapCupertinoPage(
        const SessionListPage(),
        providers: [
          ChangeNotifierProvider<SessionProvider>(
            create: (_) => SessionProvider(repository),
          ),
        ],
      );

  testWidgets('渲染登录设备列表', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('登录设备'), findsOneWidget);
    expect(find.text('iPhone 15'), findsOneWidget);
    expect(find.text('MacBook Pro'), findsOneWidget);
  });
}
