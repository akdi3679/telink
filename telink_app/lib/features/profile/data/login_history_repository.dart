import 'package:dio/dio.dart';

class LoginAttempt {
  final String id;
  final String action;
  final String? ip;
  final String? userAgent;
  final String? geoCity;
  final String? geoCountry;
  final Map<String, dynamic> details;
  final DateTime createdAt;

  const LoginAttempt({
    required this.id,
    required this.action,
    this.ip,
    this.userAgent,
    this.geoCity,
    this.geoCountry,
    this.details = const {},
    required this.createdAt,
  });

  factory LoginAttempt.fromJson(Map<String, dynamic> j) => LoginAttempt(
        id: j['id'] as String,
        action: j['action'] as String,
        ip: j['ip'] as String?,
        userAgent: j['userAgent'] as String?,
        geoCity: j['geoCity'] as String?,
        geoCountry: j['geoCountry'] as String?,
        details: (j['details'] as Map?)?.cast<String, dynamic>() ?? const {},
        createdAt: DateTime.parse(j['createdAt'] as String),
      );

  bool get isSuccess => action == 'auth.login.succeeded';
  bool get isFailure => action == 'auth.login.failed';
  bool get isNewDevice => action == 'auth.login.new_device';
  bool get isImpossible => action == 'auth.login.impossible_travel';
}

class LoginHistoryRepository {
  final Dio _dio;
  LoginHistoryRepository(this._dio);

  Future<List<LoginAttempt>> list({int limit = 20}) async {
    final res = await _dio.get(
      '/auth/login-history',
      queryParameters: {'limit': limit},
    );
    final list = (res.data as List).cast<Map<String, dynamic>>();
    return list.map(LoginAttempt.fromJson).toList();
  }
}