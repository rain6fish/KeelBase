// SPDX-License-Identifier: Apache-2.0

import '../../../events/data/models/event_model.dart';
import '../../../auth/data/models/user_model.dart';

/// 全局搜索结果：本人事件 + 公开用户
class SearchResult {
  final List<EventModel> events;
  final List<UserModel> users;

  const SearchResult({this.events = const [], this.users = const []});

  factory SearchResult.fromJson(Map<String, dynamic> json) {
    final eventsData = (json['events'] as Map<String, dynamic>?)?['items'] as List? ?? [];
    final usersData = (json['users'] as Map<String, dynamic>?)?['items'] as List? ?? [];
    return SearchResult(
      events: eventsData
          .map((e) => EventModel.fromJson(e as Map<String, dynamic>))
          .toList(),
      users: usersData
          .map((u) => UserModel.fromJson(u as Map<String, dynamic>))
          .toList(),
    );
  }
}
