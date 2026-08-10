import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/form_schema_model.dart';

class FormRepository {
  final ApiClient _client;

  FormRepository(this._client);

  Future<FormSchemaModel> getForm(String slug) async {
    final json = await _client.get('/forms/$slug');
    final response = ApiResponse.fromJson(json, (data) => FormSchemaModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> submit(String slug, Map<String, dynamic> data) async {
    await _client.post('/forms/$slug/submit', data: data);
  }
}
