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
    return TokenModel(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      user: UserModel.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}
