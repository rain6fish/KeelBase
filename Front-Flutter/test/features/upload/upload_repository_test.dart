import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/upload/data/repositories/upload_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late UploadRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = UploadRepository(apiClient);
  });

  test('uploadFile 委托 client 并解析 UploadResultModel', () async {
    when(() => apiClient.uploadFile(any(), any())).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': {
        'url': '/uploads/123-photo.webp',
        'filename': '123-photo.webp',
        'originalName': 'photo.png',
        'size': 10240,
        'mimeType': 'image/webp',
      },
      'timestamp': '',
    });

    final result = await repository.uploadFile('/tmp/photo.png', 'photo.png');
    expect(result.url, '/uploads/123-photo.webp');
    expect(result.mimeType, 'image/webp');
    expect(result.size, 10240);
    verify(() => apiClient.uploadFile('/tmp/photo.png', 'photo.png')).called(1);
  });
}
