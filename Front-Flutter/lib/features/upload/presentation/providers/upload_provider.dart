import 'package:flutter/foundation.dart';
import '../../data/repositories/upload_repository.dart';
import '../../data/models/upload_result_model.dart';

class UploadProvider extends ChangeNotifier {
  final UploadRepository _repository;

  UploadResultModel? _result;
  bool _isUploading = false;
  String? _error;

  UploadProvider(this._repository);

  UploadResultModel? get result => _result;
  bool get isUploading => _isUploading;
  String? get error => _error;

  Future<bool> uploadFile(String filePath, String fileName) async {
    _isUploading = true;
    _error = null;
    _result = null;
    notifyListeners();

    try {
      _result = await _repository.uploadFile(filePath, fileName);
      _isUploading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isUploading = false;
      notifyListeners();
      return false;
    }
  }

  void clear() {
    _result = null;
    _error = null;
    notifyListeners();
  }
}
