import 'package:flutter/foundation.dart';

/// Device integrity check (jailbreak / root detection).
///
/// The original implementation used `flutter_jailbreak_detection`, but
/// that plugin was last updated before AGP 8 required a `namespace` in
/// its Android build file, so it breaks the Flutter Android build.
///
/// For now this returns a safe default (not compromised) on every
/// platform. When we build for a real Android/iOS target, we will
/// either:
///   - fork the plugin and add the namespace, or
///   - use a maintained alternative.
///
/// The interface stays the same so nothing else needs to change.
class DeviceIntegrity {
  static bool? _cached;

  static Future<bool> isCompromised() async {
    if (kIsWeb) return false;
    if (_cached != null) return _cached!;
    // TODO(mobile-build): replace with a real jailbreak / root check.
    _cached = false;
    return _cached!;
  }
}