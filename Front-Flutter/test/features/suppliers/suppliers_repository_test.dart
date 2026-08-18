import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/suppliers/data/repositories/suppliers_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late SuppliersRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = SuppliersRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getSuppliers 解析列表', () async {
    when(() => apiClient.get('/suppliers')).thenAnswer((_) async => res([
          {'id': 1, 'name': '华东供应商', 'contact': '张三'},
        ]));
    final list = await repository.getSuppliers();
    expect(list.single.name, '华东供应商');
  });

  test('getSuppliers 空列表返回空数组', () async {
    when(() => apiClient.get('/suppliers')).thenAnswer((_) async => res(null));
    expect(await repository.getSuppliers(), isEmpty);
  });

  test('create POST 并解析', () async {
    when(() => apiClient.post('/suppliers', data: any(named: 'data')))
        .thenAnswer((_) async => res({'id': 2, 'name': '新供应商', 'contact': 'c'}));
    final s = await repository.create({'name': '新供应商'});
    expect(s.id, 2);
    verify(() => apiClient.post('/suppliers', data: {'name': '新供应商'})).called(1);
  });

  test('delete 调用 DELETE', () async {
    when(() => apiClient.delete('/suppliers/1')).thenAnswer((_) async => res(null));
    await repository.delete(1);
    verify(() => apiClient.delete('/suppliers/1')).called(1);
  });
}
