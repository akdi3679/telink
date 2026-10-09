import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Verifies at boot that secure storage is actually available and
/// functioning on this device. If it is not, we refuse to store tokens
/// (fail closed) and force the user to re-login on every launch.
class SecureStorageAudit {
  static Future<bool> isAvailable() async {
    try {
      const storage = FlutterSecureStorage();
      const probeKey = '__telink_probe__';
      await storage.write(key: probeKey, value: '1');
      final read = await storage.read(key: probeKey);
      await storage.delete(key: probeKey);
      return read == '1';
    } catch (e) {
      if (kDebugMode) {
        // ignore: avoid_print
        print('Secure storage unavailable: $e');
      }
      return false;
    }
  }
}