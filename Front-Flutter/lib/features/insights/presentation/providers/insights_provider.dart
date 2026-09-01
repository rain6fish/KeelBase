// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import '../../data/models/insights_model.dart';
import '../../data/repositories/insights_repository.dart';

/// 数据洞察状态：加载 / 数据 / 错误。
class InsightsProvider extends ChangeNotifier {
  final InsightsRepository _repository;

  InsightsProvider(this._repository);

  InsightsModel? insights;
  bool loading = false;
  String? error;

  Future<void> load({int days = 30}) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      insights = await _repository.getInsights(days: days);
    } catch (e) {
      error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  void clear() {
    insights = null;
    error = null;
    loading = false;
    notifyListeners();
  }
}
