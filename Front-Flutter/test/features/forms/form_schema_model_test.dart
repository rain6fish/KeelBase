// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/forms/data/models/form_schema_model.dart';

void main() {
  test('FormSchemaModel.fromJson 从 schema 嵌套解析字段', () {
    final schema = FormSchemaModel.fromJson({
      'id': 1,
      'title': '报名表',
      'schema': {
        'fields': [
          {'key': 'name', 'label': '姓名', 'type': 'text', 'required': true},
          {'key': 'phone', 'label': '电话', 'type': 'tel', 'options': ['a']},
        ],
      },
    });
    expect(schema.id, 1);
    expect(schema.title, '报名表');
    expect(schema.fields, hasLength(2));
    expect(schema.fields.first.key, 'name');
    expect(schema.fields.first.required, isTrue);
    expect(schema.fields.last.options, ['a']);
  });

  test('缺字段时安全回退默认值', () {
    final schema = FormSchemaModel.fromJson({});
    expect(schema.id, 0);
    expect(schema.title, '');
    expect(schema.fields, isEmpty);
    final field = FormFieldModel.fromJson({});
    expect(field.type, 'text');
    expect(field.required, isFalse);
  });
}
