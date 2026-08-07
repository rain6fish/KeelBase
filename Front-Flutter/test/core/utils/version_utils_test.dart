import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/utils/version_utils.dart';

void main() {
  group('compareVersions', () {
    test('equal versions', () {
      expect(compareVersions('1.0.0', '1.0.0'), 0);
    });

    test('newer > older', () {
      expect(compareVersions('1.1.0', '1.0.0'), 1);
      expect(compareVersions('2.0.0', '1.9.9'), 1);
      expect(compareVersions('1.0.1', '1.0.0'), 1);
    });

    test('older < newer', () {
      expect(compareVersions('1.0.0', '1.1.0'), -1);
      expect(compareVersions('1.9.9', '2.0.0'), -1);
    });

    test('patch/major boundary', () {
      expect(compareVersions('1.0.0', '1.0.1'), -1);
      expect(compareVersions('1.0.9', '1.1.0'), -1);
    });

    test('missing segments treated as 0', () {
      expect(compareVersions('1.0', '1.0.0'), 0);
      expect(compareVersions('1.0.1', '1.0'), 1);
    });

    test('build number ignored', () {
      expect(compareVersions('1.0.0+5', '1.0.0'), 0);
    });
  });
}
