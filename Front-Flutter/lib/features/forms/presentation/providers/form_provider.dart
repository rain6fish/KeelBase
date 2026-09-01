// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import '../../data/models/form_schema_model.dart';
import '../../data/repositories/form_repository.dart';

/// PL-10 动态表单状态：加载 schema + 值 + 校验错误 + 提交。
class FormProvider extends ChangeNotifier {
  final FormRepository _repository;
  final String _slug;

  FormProvider(this._repository, this._slug);

  FormSchemaModel? schema;
  bool loading = false;
  String? error;
  bool submitting = false;
  Map<String, dynamic> values = {};
  Map<String, String> fieldErrors = {};
  String? submitError;
  bool submitted = false;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      schema = await _repository.getForm(_slug);
      // 初始化默认值
      for (final f in schema!.fields) {
        if (f.type == 'boolean') values[f.key] = false;
      }
    } catch (e) {
      error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  void setValue(String key, dynamic value) {
    values[key] = value;
    fieldErrors.remove(key);
    notifyListeners();
  }

  /// 按 schema 校验，返回是否通过。
  bool validate() {
    final s = schema;
    if (s == null) return false;
    final errors = <String, String>{};
    for (final f in s.fields) {
      final v = values[f.key];
      if (f.required && (v == null || (v is String && v.trim().isEmpty))) {
        errors[f.key] = '「${f.label}」为必填';
        continue;
      }
      if (v == null || (v is String && v.trim().isEmpty)) continue;
      if (f.type == 'email' && v is String && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)) {
        errors[f.key] = '邮箱格式不正确';
      }
    }
    fieldErrors = errors;
    notifyListeners();
    return errors.isEmpty;
  }

  Future<bool> submit() async {
    if (!validate()) return false;
    submitting = true;
    submitError = null;
    notifyListeners();
    try {
      await _repository.submit(_slug, values);
      submitted = true;
    } catch (e) {
      submitError = e.toString();
    }
    submitting = false;
    notifyListeners();
    return submitted;
  }
}
