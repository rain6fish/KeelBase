// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import '../../data/models/form_schema_model.dart';
import '../../data/repositories/form_repository.dart';

/// 字段级校验失败的种类。**以 key 表示、不携带文案** —— provider 没有 BuildContext，
/// 要给人看的句子由页面从 `AppLocalizations` 取（必填那条还要插字段名）。
///
/// Which kind of validation failed, as a key rather than a sentence: this layer has no build
/// context, so the page turns the key into text in the reader's language.
enum FormFieldError { required, invalidEmail }

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
  Map<String, FormFieldError> fieldErrors = {};
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
    final errors = <String, FormFieldError>{};
    for (final f in s.fields) {
      final v = values[f.key];
      if (f.required && (v == null || (v is String && v.trim().isEmpty))) {
        errors[f.key] = FormFieldError.required;
        continue;
      }
      if (v == null || (v is String && v.trim().isEmpty)) continue;
      if (f.type == 'email' && v is String && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)) {
        errors[f.key] = FormFieldError.invalidEmail;
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
