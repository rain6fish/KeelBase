import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/customer_model.dart';
import '../models/customer_detail_model.dart';

/// AI CRM 数据访问（客户 CRUD + 详情聚合 + 订单/跟进/任务/风险子资源）
class CrmRepository {
  final ApiClient _client;

  CrmRepository(this._client);

  Future<List<CustomerModel>> getCustomers({
    String? status,
    String? riskLevel,
    String? keyword,
  }) async {
    final json = await _client.get('/crm/customers', queryParameters: {
      if (status != null && status.isNotEmpty) 'status': status,
      if (riskLevel != null && riskLevel.isNotEmpty) 'riskLevel': riskLevel,
      if (keyword != null && keyword.isNotEmpty) 'keyword': keyword,
      'limit': '100',
    });
    final response = ApiResponse.fromJson(json, (data) {
      final items = (data as Map<String, dynamic>)['items'] as List? ?? [];
      return items.map((e) => CustomerModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<CustomerDetailModel> getCustomerDetail(int id) async {
    final json = await _client.get('/crm/customers/$id');
    final response = ApiResponse.fromJson(
      json,
      (data) => CustomerDetailModel.fromJson(data as Map<String, dynamic>),
    );
    return response.data!;
  }

  Future<CustomerModel> createCustomer(Map<String, dynamic> data) async {
    final json = await _client.post('/crm/customers', data: data);
    final response = ApiResponse.fromJson(
      json,
      (data) => CustomerModel.fromJson(data as Map<String, dynamic>),
    );
    return response.data!;
  }

  Future<CustomerModel> updateCustomer(int id, Map<String, dynamic> data) async {
    final json = await _client.patch('/crm/customers/$id', data: data);
    final response = ApiResponse.fromJson(
      json,
      (data) => CustomerModel.fromJson(data as Map<String, dynamic>),
    );
    return response.data!;
  }

  Future<void> deleteCustomer(int id) async {
    await _client.delete('/crm/customers/$id');
  }

  Future<void> createOrder(int customerId, Map<String, dynamic> data) async {
    await _client.post('/crm/customers/$customerId/orders', data: data);
  }

  Future<void> createActivity(int customerId, Map<String, dynamic> data) async {
    await _client.post('/crm/customers/$customerId/activities', data: data);
  }

  Future<void> createTask({int? customerId, required String title, String? description, String? dueDate}) async {
    await _client.post('/crm/tasks', data: {
      if (customerId != null) 'customerId': customerId,
      'title': title,
      if (description != null) 'description': description,
      if (dueDate != null) 'dueDate': dueDate,
    });
  }

  Future<void> completeTask(int id) async {
    await _client.post('/crm/tasks/$id/complete');
  }
}
