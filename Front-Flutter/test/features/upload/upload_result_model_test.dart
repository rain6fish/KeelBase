// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/upload/data/models/upload_result_model.dart';

void main() {
  test('fromJson 解析完整字段', () {
    final r = UploadResultModel.fromJson({
      'url': '/uploads/1.webp',
      'filename': '1.webp',
      'originalName': 'a.png',
      'size': 100,
      'mimeType': 'image/webp',
    });
    expect(r.url, '/uploads/1.webp');
    expect(r.filename, '1.webp');
    expect(r.originalName, 'a.png');
    expect(r.size, 100);
    expect(r.mimeType, 'image/webp');
  });
}
