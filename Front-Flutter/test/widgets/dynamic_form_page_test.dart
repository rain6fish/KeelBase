import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/features/forms/presentation/pages/dynamic_form_page.dart';
import '../helpers.dart';

void main() {
  late MockApiClient apiClient;

  final schemaJson = {
    'id': 1,
    'title': '员工反馈',
    'description': '请填写你的反馈',
    'schema': {
      'title': '员工反馈',
      'fields': [
        {'key': 'name', 'label': '姓名', 'type': 'text', 'required': true, 'placeholder': '请输入姓名'},
        {'key': 'email', 'label': '邮箱', 'type': 'email', 'required': true, 'placeholder': 'you@example.com'},
        {'key': 'score', 'label': '满意度', 'type': 'select', 'required': true, 'options': ['满意', '一般', '不满意']},
        {'key': 'agree', 'label': '是否同意', 'type': 'boolean'},
        {'key': 'note', 'label': '备注', 'type': 'textarea'},
      ],
    },
  };

  setUp(() {
    apiClient = MockApiClient();
    when(() => apiClient.get('/forms/feedback'))
        .thenAnswer((_) async => {
              'code': 200,
              'message': 'ok',
              'timestamp': '',
              'data': schemaJson,
            });
  });

  Widget wrap() => wrapCupertinoPage(
        const DynamicFormPage(slug: 'feedback'),
        providers: [
          Provider<ApiClient>.value(value: apiClient),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    // provider.load() 在 create 中同步触发，推进 getForm 异步完成
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('按 schema 渲染动态表单字段', (tester) async {
    await pumpPage(tester);

    expect(find.text('员工反馈'), findsWidgets); // 导航栏 + 描述区
    expect(find.text('请填写你的反馈'), findsOneWidget);
    expect(find.text('姓名 *'), findsOneWidget);
    expect(find.text('邮箱 *'), findsOneWidget);
    expect(find.text('满意度 *'), findsOneWidget);
    expect(find.text('是否同意'), findsOneWidget);
    expect(find.text('备注'), findsOneWidget);
    expect(find.text('请选择'), findsOneWidget); // select 默认占位
    expect(find.text('提交'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('必填缺失时点提交 → 提示且不调用接口', (tester) async {
    await pumpPage(tester);

    await tester.ensureVisible(find.text('提交'));
    await tester.pump();
    await tester.tap(find.text('提交'));
    await tester.pump();

    expect(find.text('「姓名」为必填'), findsOneWidget);
    expect(find.text('请检查表单填写'), findsOneWidget); // toast
    verifyNever(() => apiClient.post('/forms/feedback/submit', data: any(named: 'data')));
    // flush toast timer
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('填写必填项并提交 → 调用接口并显示成功', (tester) async {
    when(() => apiClient.post('/forms/feedback/submit', data: any(named: 'data')))
        .thenAnswer((_) async => {
              'code': 200,
              'message': 'ok',
              'timestamp': '',
              'data': null,
            });

    await pumpPage(tester);

    // 填写文本字段（text + email）
    await tester.enterText(find.byType(CupertinoTextField).at(0), '张三');
    await tester.enterText(find.byType(CupertinoTextField).at(1), 'zhang@example.com');
    await tester.pump();

    // 选择 select 选项
    await tester.tap(find.text('请选择'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('满意'));
    await tester.pumpAndSettle();

    // 提交
    await tester.ensureVisible(find.text('提交'));
    await tester.pump();
    await tester.tap(find.text('提交'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => apiClient.post('/forms/feedback/submit', data: any(named: 'data'))).called(1);
    expect(find.text('提交成功'), findsOneWidget);
  });
}
