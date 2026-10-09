import 'package:dio/dio.dart';

class DpopRepository {
  final Dio _dio;
  DpopRepository(this._dio);

  /// Register the client's public JWK for the current session.
  Future<void> register(Map<String, dynamic> publicJwk, {String? deviceName}) async {
    await _dio.post('/auth/dpop/register', data: {
      'publicKey': publicJwk,
      if (deviceName != null) 'deviceName': deviceName,
    });
  }

  /// Query server-side registration + enforcement state.
  Future<Map<String, dynamic>> status() async {
    final res = await _dio.get('/auth/dpop/status');
    return (res.data as Map).cast<String, dynamic>();
  }

  /// Unregister (forces re-registration on next boot).
  Future<void> unregister() async {
    await _dio.delete('/auth/dpop');
  }
}