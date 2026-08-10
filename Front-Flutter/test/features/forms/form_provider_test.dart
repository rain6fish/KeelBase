import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/forms/data/models/form_schema_model.dart';
import 'package:front_app/features/forms/data/repositories/form_repository.dart';
import 'package:front_app/features/forms/presentation/providers/form_provider.dart';
import '../../helpers.dart';

void main() {
  late MockFormRepository repository;
  late FormProvider provider;

  final schema = FormSchemaModel(
    id: 1,
    title: '活动报名',
    fields: [
      FormFieldModel(key: 'name', label: '姓名', type: 'text', required: true),
      FormFieldModel(key: 'email', label: '邮箱', type: 'email', required: true),
      FormFieldModel(key: 'city', label: '城市', type: 'select', options: ['北京', '上海']),
    ],
  );

  setUp(() {
    repository = MockFormRepository();
    provider = FormProvider(repository, 'signup');
  });

  tearDown(() {
    provider.dispose();
  });

  test('load 成功填充 schema 并初始化布尔默认值', () async {
    when(() => repository.getForm('signup')).thenAnswer((_) async => schema);
    await provider.load();

    expect(provider.loading, isFalse);
    expect(provider.schema!.title, '活动报名');
    expect(provider.schema!.fields.length, 3);
    expect(provider.error, isNull);
  });

  test('load 失败记录 error', () async {
    when(() => repository.getForm('signup')).thenThrow(Exception('net'));
    await provider.load();
    expect(provider.error, isNotNull);
  });

  test('validate 缺必填返回 false 并填 error', () async {
    when(() => repository.getForm('signup')).thenAnswer((_) async => schema);
    await provider.load();

    final ok = provider.validate();
    expect(ok, isFalse);
    expect(provider.fieldErrors['name'], isNotNull);
  });

  test('validate 邮箱格式错误', () async {
    when(() => repository.getForm('signup')).thenAnswer((_) async => schema);
    await provider.load();
    provider.setValue('name', '张三');
    provider.setValue('email', 'bad-email');

    expect(provider.validate(), isFalse);
    expect(provider.fieldErrors['email'], isNotNull);
  });

  test('submit 合法数据成功', () async {
    when(() => repository.getForm('signup')).thenAnswer((_) async => schema);
    when(() => repository.submit(any(), any())).thenAnswer((_) async {});
    await provider.load();
    provider.setValue('name', '张三');
    provider.setValue('email', 'z@x.com');

    final ok = await provider.submit();

    expect(ok, isTrue);
    expect(provider.submitted, isTrue);
    verify(() => repository.submit('signup', any())).called(1);
  });

  test('submit 失败记录 submitError', () async {
    when(() => repository.getForm('signup')).thenAnswer((_) async => schema);
    when(() => repository.submit(any(), any())).thenThrow(Exception('server down'));
    await provider.load();
    provider.setValue('name', '张三');
    provider.setValue('email', 'z@x.com');

    final ok = await provider.submit();

    expect(ok, isFalse);
    expect(provider.submitError, isNotNull);
  });
}
