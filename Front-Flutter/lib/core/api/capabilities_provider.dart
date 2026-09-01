// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import 'capabilities_repository.dart';
import 'app_capabilities.dart';

/// MOD-4：应用启动时拉取 capabilities，供各端按启用模块隐藏导航。
/// 失败或未加载时默认全部开启（不误隐藏导航）。
class CapabilitiesProvider extends ChangeNotifier {
  final CapabilitiesRepository _repository;
  AppCapabilities? _capabilities;

  CapabilitiesProvider(this._repository);

  AppCapabilities? get capabilities => _capabilities;

  bool isFeatureEnabled(String key) =>
      _capabilities?.isFeatureEnabled(key) ?? true;

  bool hasBusinessModule(String id) =>
      _capabilities?.hasBusinessModule(id) ?? true;

  Future<void> load() async {
    try {
      _capabilities = await _repository.getCapabilities();
      notifyListeners();
    } catch (_) {
      // 网络失败保持 null → 默认全开
    }
  }
}
