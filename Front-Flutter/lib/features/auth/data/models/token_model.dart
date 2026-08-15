import 'user_model.dart';

class TokenModel {
  final String accessToken;
  final String refreshToken;
  final UserModel user;

  TokenModel({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory TokenModel.fromJson(Map<String, dynamic> json) {
    final accessToken = json['accessToken'];
    final refreshToken = json['refreshToken'];
    final user = json['user'];
    // 防御性解析：字段缺失/类型不符时抛出带字段名的错误，而不是裸 TypeError
    if (accessToken is! String || accessToken.isEmpty) {
      throw FormatException('TokenModel: missing or invalid "accessToken"');
    }
    if (refreshToken is! String || refreshToken.isEmpty) {
      throw FormatException('TokenModel: missing or invalid "refreshToken"');
    }
    if (user is! Map<String, dynamic>) {
      throw FormatException('TokenModel: missing or invalid "user"');
    }
    return TokenModel(
      accessToken: accessToken,
      refreshToken: refreshToken,
      user: UserModel.fromJson(user),
    );
  }

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'user': user.toJson(),
      };
}
