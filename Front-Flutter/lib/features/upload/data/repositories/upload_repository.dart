import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/upload_result_model.dart';

class UploadRepository {
  final ApiClient _client;

  UploadRepository(this._client);

  Future<UploadResultModel> uploadFile(String filePath, String fileName) async {
    final json = await _client.uploadFile(filePath, fileName);
    final response = ApiResponse.fromJson(json, (data) => UploadResultModel.fromJson(data));
    return response.data!;
  }
}
