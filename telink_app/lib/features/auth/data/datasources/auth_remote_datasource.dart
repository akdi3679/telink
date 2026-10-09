import 'package:dio/dio.dart';

class PasskeyLoginBegin {
  final Map<String, dynamic> options;
  final String sessionId;
  PasskeyLoginBegin({required this.options, required this.sessionId});
}

class AuthRemoteDataSource {
  final Dio _dio;
  AuthRemoteDataSource(this._dio);

  Future<String> signupStart(String phone, String email) async {
    final res = await _dio.post(
      '/auth/signup/start',
      data: {'phone': phone, 'email': email},
    );
    return (res.data as Map)['signupId'] as String;
  }

  Future<String> signupVerifyEmail(String signupId, String code) async {
    final res = await _dio.post(
      '/auth/signup/verify-email',
      data: {'signupId': signupId, 'code': code},
    );
    return (res.data as Map)['signupToken'] as String;
  }

  Future<Map<String, dynamic>> signupComplete({
    required String signupToken,
    required String password,
    required String firstName,
    required String lastName,
    required String role,
    required String jobTitle,
  }) async {
    final res = await _dio.post('/auth/signup/complete', data: {
      'signupToken': signupToken,
      'password': password,
      'firstName': firstName,
      'lastName': lastName,
      'role': role,
      'jobTitle': jobTitle,
    });
    return (res.data as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> login(String identifier, String password) async {
    final res = await _dio.post(
      '/auth/login',
      data: {'identifier': identifier, 'password': password},
    );
    return (res.data as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> me() async {
    final res = await _dio.get('/auth/me');
    return (res.data as Map).cast<String, dynamic>();
  }

  // ── Passkey ────────────────────────────────────────────────

  Future<PasskeyLoginBegin> passkeyLoginBegin({String? identifier}) async {
    final res = await _dio.post(
      '/auth/passkey/login/begin',
      data: {
        if (identifier != null && identifier.isNotEmpty)
          'identifier': identifier,
      },
    );
    final data = (res.data as Map).cast<String, dynamic>();
    return PasskeyLoginBegin(
      options: (data['options'] as Map).cast<String, dynamic>(),
      sessionId: data['sessionId'] as String,
    );
  }

  Future<Map<String, dynamic>> passkeyLoginFinish({
    required String sessionId,
    required Map<String, dynamic> response,
  }) async {
    final res = await _dio.post(
      '/auth/passkey/login/finish',
      data: {'sessionId': sessionId, 'response': response},
    );
    return (res.data as Map).cast<String, dynamic>();
  }
}