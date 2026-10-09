import 'package:flutter/foundation.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';

/// Detects jailbroken (iOS) or rooted (Android) devices.
///
/// Behavior:
///   - On web, always returns clean (no equivalent signal).
///   - On mobile, checks the OS for jailbreak/root indicators.
///
/// We do NOT block the app. We flag it and let the app decide what to do
/// on sensitive screens (e.g. medical info, high-value actions).
class DeviceIntegrity {
  static bool? _cached;

  static Future<bool> isCompromised() async {
    if (kIsWeb) return false;
    if (_cached != null) return _cached!;
    try {
      final jb = await FlutterJailbreakDetection.jailbroken;
      final dev = await FlutterJailbreakDetection.developerMode;
      _cached = jb || dev;
      return _cached!;
    } catch (e) {
      if (kDebugMode) {
        // ignore: avoid_print
        print('Integrity check failed: $e');
      }
      // Fail open — do not block the app because we can't check.
      _cached = false;
      return false;
    }
  }
}