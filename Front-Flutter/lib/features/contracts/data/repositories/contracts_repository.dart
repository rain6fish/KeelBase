import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/contract_model.dart';

class ContractsRepository {
  final ApiClient _client;

  ContractsRepository(this._client);

  Future<List<ContractModel>> getContracts() async {
    final json = await _client.get('/contracts');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => ContractModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<ContractModel> create(Map<String, dynamic> data) async {
    final json = await _client.post('/contracts', data: data);
    final response = ApiResponse.fromJson(json, (data) => ContractModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/contracts/$id');
  }
}
