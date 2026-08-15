import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/notifications/data/models/notification_model.dart';
import 'package:front_app/features/notifications/presentation/pages/notifications_page.dart';
import 'package:front_app/features/notifications/presentation/providers/notifications_provider.dart';
import '../helpers.dart';

void main() {
  late MockNotificationsRepository repository;

  setUp(() {
    repository = MockNotificationsRepository();
    when(() => repository.getNotifications(page: any(named: 'page'), limit: any(named: 'limit')))
        .thenAnswer((_) async => [
          NotificationModel(id: 1, title: '新活动', body: '周末活动', isRead: false),
          NotificationModel(id: 2, title: '系统通知', isRead: true),
        ]);
    when(() => repository.getUnreadCount()).thenAnswer((_) async => 1);
  });

  Widget wrap() => wrapCupertinoPage(
        const NotificationsPage(),
        providers: [
          ChangeNotifierProvider<NotificationsProvider>(
            create: (_) => NotificationsProvider(repository),
          ),
        ],
      );

  testWidgets('渲染通知列表', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('通知'), findsOneWidget);
    expect(find.text('新活动'), findsOneWidget);
    expect(find.text('系统通知'), findsOneWidget);
  });
}
