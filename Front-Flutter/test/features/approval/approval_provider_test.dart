import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/approval/data/models/approval_models.dart';
import 'package:front_app/features/approval/data/repositories/approval_repository.dart';
import 'package:front_app/features/approval/presentation/providers/approval_provider.dart';
import '../../helpers.dart';

class MockApprovalRepository extends Mock implements ApprovalRepository {}

void main() {
  late MockApprovalRepository repo;
  late ApprovalProvider provider;

  setUp(() {
    repo = MockApprovalRepository();
    provider = ApprovalProvider(repo);
  });

  ApprovalRequestModel request({int id = 1, String status = 'pending'}) =>
      ApprovalRequestModel(id: id, title: '采购报销', reason: '差旅', status: status);

  test('loadRequests 成功拉取并置 loading false', () async {
    when(() => repo.getRequests(status: any(named: 'status')))
        .thenAnswer((_) async => [request()]);
    await provider.loadRequests();
    expect(provider.requests.single.title, '采购报销');
    expect(provider.loading, isFalse);
    expect(provider.error, isNull);
  });

  test('loadRequests 失败置 error', () async {
    when(() => repo.getRequests(status: any(named: 'status')))
        .thenThrow(Exception('网络错误'));
    await provider.loadRequests();
    expect(provider.requests, isEmpty);
    expect(provider.error, isNotNull);
  });

  test('loadPolicies 成功拉取', () async {
    when(() => repo.getPolicies()).thenAnswer((_) async => [
          ApprovalPolicyModel(id: 1, title: '大额审批', maxAmount: 5000),
        ]);
    await provider.loadPolicies();
    expect(provider.policies.single.title, '大额审批');
  });

  test('loadPolicies 失败静默（不抛错不置 error）', () async {
    when(() => repo.getPolicies()).thenThrow(Exception('x'));
    await provider.loadPolicies();
    expect(provider.policies, isEmpty);
  });

  test('createRequest 成功返回 true 并刷新列表', () async {
    when(() => repo.createRequest(any())).thenAnswer((_) async => request(id: 2));
    when(() => repo.getRequests(status: any(named: 'status'))).thenAnswer((_) async => [request(id: 2)]);
    final ok = await provider.createRequest({'title': 't'});
    expect(ok, isTrue);
    expect(provider.requests.single.id, 2);
    verify(() => repo.getRequests(status: any(named: 'status'))).called(1);
  });

  test('createRequest 失败返回 false 置 error', () async {
    when(() => repo.createRequest(any())).thenThrow(Exception('x'));
    final ok = await provider.createRequest({'title': 't'});
    expect(ok, isFalse);
    expect(provider.error, isNotNull);
  });

  test('reviewRequest 成功返回更新并刷新', () async {
    when(() => repo.reviewRequest(1)).thenAnswer((_) async => request(status: 'reviewed'));
    when(() => repo.getRequests(status: any(named: 'status'))).thenAnswer((_) async => []);
    final updated = await provider.reviewRequest(1);
    expect(updated?.status, 'reviewed');
  });

  test('decideRequest 成功返回更新', () async {
    when(() => repo.decideRequest(1, 'approved')).thenAnswer((_) async => request(status: 'approved'));
    when(() => repo.getRequests(status: any(named: 'status'))).thenAnswer((_) async => []);
    final updated = await provider.decideRequest(1, 'approved');
    expect(updated?.status, 'approved');
    verify(() => repo.decideRequest(1, 'approved')).called(1);
  });

  test('decideRequest 失败返回 null 置 error', () async {
    when(() => repo.decideRequest(1, 'approved')).thenThrow(Exception('x'));
    final updated = await provider.decideRequest(1, 'approved');
    expect(updated, isNull);
    expect(provider.error, isNotNull);
  });
}
