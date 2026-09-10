// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import 'provenance_repository.dart';
import 'app_provenance.dart';

/// FE-1：应用启动时拉取 `/app/provenance`，供「关于」展示运行时来源指纹。
/// 失败或未加载 → null（展示端降级隐藏）。
class ProvenanceProvider extends ChangeNotifier {
  final ProvenanceRepository _repository;
  AppProvenance? _provenance;

  ProvenanceProvider(this._repository);

  AppProvenance? get provenance => _provenance;

  Future<void> load() async {
    try {
      _provenance = await _repository.getProvenance();
      notifyListeners();
    } catch (_) {
      // 网络失败保持 null → 展示端隐藏
    }
  }
}
