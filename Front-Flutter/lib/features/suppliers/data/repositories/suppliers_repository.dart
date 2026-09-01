// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/supplier_model.dart';

class SuppliersRepository {
  final ApiClient _client;

  SuppliersRepository(this._client);

  Future<List<SupplierModel>> getSuppliers() async {
    final json = await _client.get('/suppliers');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => SupplierModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<SupplierModel> create(Map<String, dynamic> data) async {
    final json = await _client.post('/suppliers', data: data);
    final response = ApiResponse.fromJson(json, (data) => SupplierModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/suppliers/$id');
  }
}
