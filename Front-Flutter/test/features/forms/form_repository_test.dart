import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/forms/data/repositories/form_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late FormRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = FormRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getForm 解析 schema（含顶层 title 回退）', () async {
    when(() => apiClient.get('/forms/feedback')).thenAnswer((_) async => res({
          'id': 1,
          'schema': {
            'title': '反馈表单',
            'fields': [
              {'key': 'name', 'label': '姓名', 'type': 'text', 'required': true},
            ],
          },
        }));
    final form = await repository.getForm('feedback');
    expect(form.title, '反馈表单');
    expect(form.fields.single.key, 'name');
    expect(form.fields.single.required, isTrue);
  });

  test('getForm 缺省 schema 时回退空字段', () async {
    when(() => apiClient.get('/forms/x')).thenAnswer((_) async => res({'id': 2}));
    final form = await repository.getForm('x');
    expect(form.id, 2);
    expect(form.fields, isEmpty);
  });

  test('submit POST /forms/:slug/submit', () async {
    when(() => apiClient.post('/forms/feedback/submit', data: any(named: 'data')))
        .thenAnswer((_) async => res(null));
    await repository.submit('feedback', {'name': '张三'});
    verify(() => apiClient.post('/forms/feedback/submit', data: {'name': '张三'})).called(1);
  });
}
