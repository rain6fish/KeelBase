// SPDX-License-Identifier: Apache-2.0

/// PL-10 动态表单定义（从后端 GET /forms/:slug 解析）。
class FormFieldModel {
  final String key;
  final String label;
  final String type; // text | tel | email | number | date | textarea | select | boolean
  final bool required;
  final List<String> options;
  final String? placeholder;

  FormFieldModel({
    required this.key,
    required this.label,
    required this.type,
    this.required = false,
    this.options = const [],
    this.placeholder,
  });

  factory FormFieldModel.fromJson(Map<String, dynamic> json) => FormFieldModel(
        key: json['key'] as String? ?? '',
        label: json['label'] as String? ?? '',
        type: json['type'] as String? ?? 'text',
        required: json['required'] as bool? ?? false,
        options: (json['options'] as List? ?? []).map((e) => e.toString()).toList(),
        placeholder: json['placeholder'] as String?,
      );
}

class FormSchemaModel {
  final int id;
  final String title;
  final String? description;
  final List<FormFieldModel> fields;

  FormSchemaModel({
    required this.id,
    required this.title,
    this.description,
    required this.fields,
  });

  factory FormSchemaModel.fromJson(Map<String, dynamic> json) {
    final schema = json['schema'] as Map<String, dynamic>? ?? const {};
    return FormSchemaModel(
      id: json['id'] as int? ?? 0,
      title: json['title'] as String? ?? schema['title'] as String? ?? '',
      description: json['description'] as String?,
      fields: (schema['fields'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(FormFieldModel.fromJson)
          .toList(),
    );
  }
}
