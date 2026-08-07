class UploadResultModel {
  final String url;
  final String filename;
  final String originalName;
  final int size;
  final String mimeType;

  UploadResultModel({
    required this.url,
    required this.filename,
    required this.originalName,
    required this.size,
    required this.mimeType,
  });

  factory UploadResultModel.fromJson(Map<String, dynamic> json) {
    return UploadResultModel(
      url: json['url'] as String,
      filename: json['filename'] as String,
      originalName: json['originalName'] as String,
      size: json['size'] as int,
      mimeType: json['mimeType'] as String,
    );
  }
}
