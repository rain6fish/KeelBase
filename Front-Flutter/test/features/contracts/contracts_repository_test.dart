import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/contracts/data/repositories/contracts_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late ContractsRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = ContractsRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getContracts 解析列表', () async {
    when(() => apiClient.get('/contracts')).thenAnswer((_) async => res([
          {'id': 1, 'name': '服务合同', 'counterparty': '华润'},
        ]));
    final list = await repository.getContracts();
    expect(list.single.counterparty, '华润');
  });

  test('getContracts 空列表返回空数组', () async {
    when(() => apiClient.get('/contracts')).thenAnswer((_) async => res(null));
    expect(await repository.getContracts(), isEmpty);
  });

  test('create POST 并解析', () async {
    when(() => apiClient.post('/contracts', data: any(named: 'data')))
        .thenAnswer((_) async => res({'id': 2, 'name': '新合同', 'counterparty': 'cp'}));
    final c = await repository.create({'name': '新合同'});
    expect(c.id, 2);
    verify(() => apiClient.post('/contracts', data: {'name': '新合同'})).called(1);
  });

  test('delete 调用 DELETE', () async {
    when(() => apiClient.delete('/contracts/1')).thenAnswer((_) async => res(null));
    await repository.delete(1);
    verify(() => apiClient.delete('/contracts/1')).called(1);
  });
}
