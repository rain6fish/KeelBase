// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/pm/data/models/project_model.dart';
import 'package:front_app/features/pm/data/repositories/pm_repository.dart';
import 'package:front_app/features/pm/presentation/providers/pm_provider.dart';
import '../../helpers.dart';

class MockPmRepository extends Mock implements PmRepository {}

void main() {
  late MockPmRepository repo;
  late PmProvider provider;

  setUp(() {
    repo = MockPmRepository();
    provider = PmProvider(repo);
  });

  ProjectModel project({int id = 1}) => ProjectModel(id: id, name: '官网改版', status: 'active');

  ProjectDetailModel detail(int id) => ProjectDetailModel(
        project: project(id: id),
        milestones: [
          MilestoneModel(id: 1, projectId: id, title: '设计'),
        ],
      );

  test('loadProjects 成功拉取', () async {
    when(() => repo.getProjects()).thenAnswer((_) async => [project()]);
    await provider.loadProjects();
    expect(provider.projects.single.name, '官网改版');
    expect(provider.loading, isFalse);
  });

  test('loadProjects 失败置 error', () async {
    when(() => repo.getProjects()).thenThrow(Exception('x'));
    await provider.loadProjects();
    expect(provider.error, isNotNull);
    expect(provider.loading, isFalse);
  });

  test('loadDetail 成功返回 true', () async {
    when(() => repo.getProjectDetail(1)).thenAnswer((_) async => detail(1));
    final ok = await provider.loadDetail(1);
    expect(ok, isTrue);
    expect(provider.detail?.project.name, '官网改版');
    expect(provider.detail?.milestones.single.title, '设计');
  });

  test('loadDetail 失败返回 false 置 error', () async {
    when(() => repo.getProjectDetail(1)).thenThrow(Exception('x'));
    final ok = await provider.loadDetail(1);
    expect(ok, isFalse);
    expect(provider.error, isNotNull);
    expect(provider.loading, isFalse);
  });

  test('createProject 成功返回 true 并刷新列表', () async {
    when(() => repo.createProject(any())).thenAnswer((_) async => project(id: 2));
    when(() => repo.getProjects()).thenAnswer((_) async => [project(id: 2)]);
    final ok = await provider.createProject({'name': 'x'});
    expect(ok, isTrue);
    expect(provider.projects.single.id, 2);
  });

  test('createProject 失败返回 false', () async {
    when(() => repo.createProject(any())).thenThrow(Exception('x'));
    expect(await provider.createProject({'name': 'x'}), isFalse);
    expect(provider.error, isNotNull);
  });

  test('deleteProject 成功返回 true 并刷新', () async {
    when(() => repo.deleteProject(1)).thenAnswer((_) async {});
    when(() => repo.getProjects()).thenAnswer((_) async => []);
    expect(await provider.deleteProject(1), isTrue);
    expect(provider.projects, isEmpty);
  });

  test('deleteProject 失败返回 false', () async {
    when(() => repo.deleteProject(1)).thenThrow(Exception('x'));
    expect(await provider.deleteProject(1), isFalse);
  });

  test('addMilestone 成功刷新详情', () async {
    when(() => repo.createMilestone(1, any())).thenAnswer((_) async {});
    when(() => repo.getProjectDetail(1)).thenAnswer((_) async => detail(1));
    expect(await provider.addMilestone(1, {'title': '设计'}), isTrue);
    verify(() => repo.getProjectDetail(1)).called(1);
  });

  test('addMilestone 失败返回 false', () async {
    when(() => repo.createMilestone(1, any())).thenThrow(Exception('x'));
    expect(await provider.addMilestone(1, {'title': '设计'}), isFalse);
  });

  test('addTask 成功刷新详情', () async {
    when(() => repo.createTask(projectId: 1, title: '开发')).thenAnswer((_) async {});
    when(() => repo.getProjectDetail(1)).thenAnswer((_) async => detail(1));
    expect(await provider.addTask(1, '开发'), isTrue);
    verify(() => repo.createTask(projectId: 1, title: '开发')).called(1);
  });

  test('addTask 失败返回 false', () async {
    when(() => repo.createTask(projectId: 1, title: '开发')).thenThrow(Exception('x'));
    expect(await provider.addTask(1, '开发'), isFalse);
  });

  test('completeTask 已有详情时刷新详情', () async {
    when(() => repo.getProjectDetail(1)).thenAnswer((_) async => detail(1));
    await provider.loadDetail(1);
    when(() => repo.completeTask(1)).thenAnswer((_) async {});
    when(() => repo.getProjectDetail(1)).thenAnswer((_) async => detail(1));
    expect(await provider.completeTask(1), isTrue);
    verify(() => repo.getProjectDetail(1)).called(2); // loadDetail + completeTask 刷新
  });

  test('completeTask 失败返回 false', () async {
    when(() => repo.completeTask(1)).thenThrow(Exception('x'));
    expect(await provider.completeTask(1), isFalse);
  });
}
