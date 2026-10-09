import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';

  final FlutterSecureStorage _s = const FlutterSecureStorage();

  Future<void> saveTokens(String access, String refresh) async {
    await _s.write(key: _kAccess, value: access);
    await _s.write(key: _kRefresh, value: refresh);
  }

  Future<String?> readAccessToken() => _s.read(key: _kAccess);
  Future<String?> readRefreshToken() => _s.read(key: _kRefresh);

  Future<void> clear() async {
    await _s.delete(key: _kAccess);
    await _s.delete(key: _kRefresh);
  }
}