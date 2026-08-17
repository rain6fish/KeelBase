import 'package:flutter/foundation.dart';
import '../../data/repositories/crm_repository.dart';
import '../../data/models/customer_model.dart';
import '../../data/models/customer_detail_model.dart';

/// AI CRM：客户列表 + 详情状态管理
class CrmProvider extends ChangeNotifier {
  final CrmRepository _repository;

  List<CustomerModel> _customers = [];
  CustomerDetailModel? _detail;
  bool _loading = false;
  String? _error;

  CrmProvider(this._repository);

  List<CustomerModel> get customers => _customers;
  CustomerDetailModel? get detail => _detail;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> loadCustomers() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _customers = await _repository.getCustomers();
    } catch (e) {
      _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> loadDetail(int id) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _detail = await _repository.getCustomerDetail(id);
      _loading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _loading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> createCustomer(Map<String, dynamic> data) async {
    try {
      await _repository.createCustomer(data);
      await loadCustomers();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateCustomer(int id, Map<String, dynamic> data) async {
    try {
      await _repository.updateCustomer(id, data);
      if (_detail != null && _detail!.customer.id == id) {
        await loadDetail(id);
      }
      await loadCustomers();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteCustomer(int id) async {
    try {
      await _repository.deleteCustomer(id);
      await loadCustomers();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> addOrder(int customerId, Map<String, dynamic> data) async {
    try {
      await _repository.createOrder(customerId, data);
      await loadDetail(customerId);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> addActivity(int customerId, Map<String, dynamic> data) async {
    try {
      await _repository.createActivity(customerId, data);
      await loadDetail(customerId);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> addTask({int? customerId, required String title, String? description, String? dueDate}) async {
    try {
      await _repository.createTask(customerId: customerId, title: title, description: description, dueDate: dueDate);
      if (customerId != null && _detail != null && _detail!.customer.id == customerId) {
        await loadDetail(customerId);
      }
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> completeTask(int id) async {
    try {
      await _repository.completeTask(id);
      if (_detail != null) await loadDetail(_detail!.customer.id);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }
}
