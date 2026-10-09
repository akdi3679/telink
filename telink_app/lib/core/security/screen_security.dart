import 'package:flutter/foundation.dart';

/// Prevents screenshots and screen recording on sensitive screens.
///
/// The original implementation used `flutter_windowmanager`, but that
/// plugin predates AGP 8's required `namespace` and breaks the Flutter
/// Android build.
///
/// On Android (when the plugin is restored) this maps to FLAG_SECURE.
/// On web and iOS it is a no-op.
class ScreenSecurity {
  static Future<void> enable() async {
    if (kIsWeb) return;
    // TODO(mobile-build): restore FLAG_SECURE via a maintained plugin.
  }

  static Future<void> disable() async {
    if (kIsWeb) return;
    // TODO(mobile-build): clear FLAG_SECURE.
  }
}