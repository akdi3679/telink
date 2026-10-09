import 'package:flutter/foundation.dart';
import 'package:flutter_windowmanager/flutter_windowmanager.dart';

/// Prevents screenshots and screen recording on sensitive screens.
///
/// Android: uses FLAG_SECURE.
/// iOS: not implemented (Apple blocks screenshots differently).
/// Web: not applicable.
class ScreenSecurity {
  static Future<void> enable() async {
    if (kIsWeb) return;
    try {
      await FlutterWindowManager.addFlags(FlutterWindowManager.FLAG_SECURE);
    } catch (_) {
      // Ignore on platforms that do not support it.
    }
  }

  static Future<void> disable() async {
    if (kIsWeb) return;
    try {
      await FlutterWindowManager.clearFlags(FlutterWindowManager.FLAG_SECURE);
    } catch (_) {
      // Ignore.
    }
  }
}