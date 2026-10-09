import 'package:flutter/foundation.dart';

/// Device integrity check (jailbreak / root detection).
///
/// The original implementation used `flutter_jailbreak_detection`, but
/// that plugin predates AGP 8's required `namespace` and breaks the
/// Flutter Android build.
///
/// For now this returns a safe default (not compromised) on every
/// platform. When we build for a real Android/iOS target, we will
/// either fork the plugin or use a maintained alternative.
class DeviceIntegrity {
  static bool? _cached;

  static Future<bool> isCompromised() async {
    if (kIsWeb) return false;
    if (_cached != null) return _cached!;
    _cached = false;
    return _cached!;
  }
}