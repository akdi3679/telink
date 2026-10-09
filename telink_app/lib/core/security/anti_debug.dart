import 'dart:io';
import 'package:flutter/foundation.dart';

/// Very lightweight anti-debug signal.
///
/// This is not a full anti-debug implementation. A dedicated attacker
/// can defeat it. It is a speed bump that catches casual tampering.
///
/// Full anti-debug on mobile requires native code (Frida detection,
/// ptrace checks) which we add in Phase 1.5e2 if needed.
class AntiDebug {
  static bool isSuspicious() {
    if (kIsWeb) return false;
    if (kDebugMode) return false;
    if (kReleaseMode) {
      // In release builds, running under the Dart VM service is unusual.
      if (Platform.environment.containsKey('DART_VM_SERVICE_PORT')) {
        return true;
      }
    }
    return false;
  }
}