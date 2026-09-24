// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import '../utils/money.dart';
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
      // 服务端是币种符号的权威（契约 v2）；取回即应用，端内常量退居兜底。
      // 取不到 display（旧服务端）时 setCurrencySymbol 忽略空值，兜底值继续生效。
      setCurrencySymbol(_capabilities?.displayCurrencySymbol);
      notifyListeners();
    } catch (_) {
      // 网络失败保持 null → 默认全开
    }
  }
}
