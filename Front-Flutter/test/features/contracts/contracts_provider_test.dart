import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:front_app/core/services/app_cache.dart';
import 'package:front_app/features/contracts/data/models/contract_model.dart';
import 'package:front_app/features/contracts/data/repositories/contracts_repository.dart';
import 'package:front_app/features/contracts/presentation/providers/contracts_provider.dart';
import '../../helpers.dart';

class MockContractsRepository extends Mock implements ContractsRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockContractsRepository repo;
  late ContractsProvider provider;

  setUp(() {
    repo = MockContractsRepository();
  });

  ContractModel contract({int id = 1, String status = 'active'}) =>
      ContractModel(id: id, name: '服务合同', counterparty: '华润', status: status);

  test('load 成功拉取网络数据（无缓存）', () async {
    provider = ContractsProvider(repo);
    when(() => repo.getContracts()).thenAnswer((_) async => [contract()]);
    await provider.load();
    expect(provider.items.single.name, '服务合同');
    expect(provider.fromCache, isFalse);
    expect(provider.loading, isFalse);
  });

  test('load 缓存优先：先渲染缓存再刷新', () async {
    SharedPreferences.setMockInitialValues({
      jsonEncode(['contracts', 'list']): jsonEncode([
        {'id': 9, 'name': '缓存合同', 'counterparty': '缓存方', 'status': 'draft'},
      ]),
    });
    final prefs = await SharedPreferences.getInstance();
    provider = ContractsProvider(repo, cache: AppCache(prefs));

    // 用 Completer 挂起网络响应，观察缓存中间态
    final gate = Completer<List<ContractModel>>();
    when(() => repo.getContracts()).thenAnswer((_) => gate.future);

    final loadFuture = provider.load();
    await pumpEventQueue();
    // 缓存已先渲染（网络未完成）
    expect(provider.items.single.name, '缓存合同');
    expect(provider.fromCache, isTrue);

    // 放行网络刷新
    gate.complete([contract(id: 1)]);
    await loadFuture;
    expect(provider.items.single.name, '服务合同');
    expect(provider.fromCache, isFalse);
  });

  test('load 网络失败且有缓存时保留缓存', () async {
    SharedPreferences.setMockInitialValues({
      jsonEncode(['contracts', 'list']): jsonEncode([
        {'id': 9, 'name': '缓存合同', 'counterparty': '缓存方', 'status': 'draft'},
      ]),
    });
    final prefs = await SharedPreferences.getInstance();
    provider = ContractsProvider(repo, cache: AppCache(prefs));
    when(() => repo.getContracts()).thenThrow(Exception('网络错误'));

    await provider.load();

    expect(provider.items.single.name, '缓存合同');
    expect(provider.error, isNull); // 有缓存时不置 error
  });

  test('load 网络失败且无缓存时置 error', () async {
    provider = ContractsProvider(repo);
    when(() => repo.getContracts()).thenThrow(Exception('网络错误'));
    await provider.load();
    expect(provider.items, isEmpty);
    expect(provider.error, isNotNull);
  });

  test('add 成功追加列表', () async {
    provider = ContractsProvider(repo);
    when(() => repo.create(any())).thenAnswer((_) async => contract(id: 2));
    final ok = await provider.add({'name': 'x'});
    expect(ok, isTrue);
    expect(provider.items.single.id, 2);
    expect(provider.error, isNull);
  });

  test('add 失败置 error 返回 false', () async {
    provider = ContractsProvider(repo);
    when(() => repo.create(any())).thenThrow(Exception('x'));
    final ok = await provider.add({'name': 'x'});
    expect(ok, isFalse);
    expect(provider.error, isNotNull);
  });

  test('remove 成功乐观移除', () async {
    provider = ContractsProvider(repo);
    when(() => repo.getContracts()).thenAnswer((_) async => [contract(id: 1), contract(id: 2)]);
    await provider.load();
    when(() => repo.delete(1)).thenAnswer((_) async {});
    final ok = await provider.remove(1);
    expect(ok, isTrue);
    expect(provider.items.map((e) => e.id), [2]);
  });

  test('remove 失败恢复原列表', () async {
    provider = ContractsProvider(repo);
    when(() => repo.getContracts()).thenAnswer((_) async => [contract(id: 1), contract(id: 2)]);
    await provider.load();
    when(() => repo.delete(1)).thenThrow(Exception('x'));
    final ok = await provider.remove(1);
    expect(ok, isFalse);
    expect(provider.items.map((e) => e.id), [1, 2]);
    expect(provider.error, isNotNull);
  });
}
