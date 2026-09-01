// SPDX-License-Identifier: Apache-2.0

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:front_app/core/services/app_cache.dart';
import 'package:front_app/features/suppliers/data/models/supplier_model.dart';
import 'package:front_app/features/suppliers/data/repositories/suppliers_repository.dart';
import 'package:front_app/features/suppliers/presentation/providers/suppliers_provider.dart';
import '../../helpers.dart';

class MockSuppliersRepository extends Mock implements SuppliersRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockSuppliersRepository repo;
  late SuppliersProvider provider;

  setUp(() {
    repo = MockSuppliersRepository();
  });

  SupplierModel supplier({int id = 1}) => SupplierModel(id: id, name: '华东供应商', contact: '张三');

  test('load 成功拉取网络数据（无缓存）', () async {
    provider = SuppliersProvider(repo);
    when(() => repo.getSuppliers()).thenAnswer((_) async => [supplier()]);
    await provider.load();
    expect(provider.items.single.name, '华东供应商');
    expect(provider.fromCache, isFalse);
    expect(provider.loading, isFalse);
  });

  test('load 缓存优先：先渲染缓存再刷新', () async {
    SharedPreferences.setMockInitialValues({
      jsonEncode(['suppliers', 'list']): jsonEncode([
        {'id': 9, 'name': '缓存供应商', 'contact': 'c', 'status': 'active', 'riskLevel': 'low'},
      ]),
    });
    final prefs = await SharedPreferences.getInstance();
    provider = SuppliersProvider(repo, cache: AppCache(prefs));

    // 用 Completer 挂起网络响应，观察缓存中间态
    final gate = Completer<List<SupplierModel>>();
    when(() => repo.getSuppliers()).thenAnswer((_) => gate.future);

    final loadFuture = provider.load();
    await pumpEventQueue();
    // 缓存已先渲染（网络未完成）
    expect(provider.items.single.name, '缓存供应商');
    expect(provider.fromCache, isTrue);

    // 放行网络刷新
    gate.complete([supplier(id: 1)]);
    await loadFuture;
    expect(provider.items.single.name, '华东供应商');
    expect(provider.fromCache, isFalse);
  });

  test('load 网络失败且有缓存时保留缓存', () async {
    SharedPreferences.setMockInitialValues({
      jsonEncode(['suppliers', 'list']): jsonEncode([
        {'id': 9, 'name': '缓存供应商', 'contact': 'c', 'status': 'active', 'riskLevel': 'low'},
      ]),
    });
    final prefs = await SharedPreferences.getInstance();
    provider = SuppliersProvider(repo, cache: AppCache(prefs));
    when(() => repo.getSuppliers()).thenThrow(Exception('网络错误'));

    await provider.load();

    expect(provider.items.single.name, '缓存供应商');
    expect(provider.error, isNull);
  });

  test('load 网络失败且无缓存时置 error', () async {
    provider = SuppliersProvider(repo);
    when(() => repo.getSuppliers()).thenThrow(Exception('网络错误'));
    await provider.load();
    expect(provider.items, isEmpty);
    expect(provider.error, isNotNull);
  });

  test('add 成功追加列表', () async {
    provider = SuppliersProvider(repo);
    when(() => repo.create(any())).thenAnswer((_) async => supplier(id: 2));
    final ok = await provider.add({'name': 'x'});
    expect(ok, isTrue);
    expect(provider.items.single.id, 2);
  });

  test('add 失败置 error 返回 false', () async {
    provider = SuppliersProvider(repo);
    when(() => repo.create(any())).thenThrow(Exception('x'));
    final ok = await provider.add({'name': 'x'});
    expect(ok, isFalse);
    expect(provider.error, isNotNull);
  });

  test('remove 成功乐观移除', () async {
    provider = SuppliersProvider(repo);
    when(() => repo.getSuppliers()).thenAnswer((_) async => [supplier(id: 1), supplier(id: 2)]);
    await provider.load();
    when(() => repo.delete(1)).thenAnswer((_) async {});
    final ok = await provider.remove(1);
    expect(ok, isTrue);
    expect(provider.items.map((e) => e.id), [2]);
  });

  test('remove 失败恢复原列表', () async {
    provider = SuppliersProvider(repo);
    when(() => repo.getSuppliers()).thenAnswer((_) async => [supplier(id: 1), supplier(id: 2)]);
    await provider.load();
    when(() => repo.delete(1)).thenThrow(Exception('x'));
    final ok = await provider.remove(1);
    expect(ok, isFalse);
    expect(provider.items.map((e) => e.id), [1, 2]);
    expect(provider.error, isNotNull);
  });
}
