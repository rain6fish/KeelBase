import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/constants/app_constants.dart';

void main() {
  group('resolveUrl', () {
    test('相对路径 → 拼完整 URL', () {
      expect(
        AppConstants.resolveUrl('/uploads/123.jpg'),
        'http://localhost:3000/uploads/123.jpg',
      );
    });

    test('绝对 URL（S3）→ 原样返回', () {
      const url = 'https://bucket.s3.amazonaws.com/2026/08/x.webp';
      expect(AppConstants.resolveUrl(url), url);
    });

    test('null / 空 → 返回空串', () {
      expect(AppConstants.resolveUrl(null), '');
      expect(AppConstants.resolveUrl(''), '');
    });
  });
}
