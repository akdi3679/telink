import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wipes in-memory state when the app is backgrounded for >60 seconds.
///
/// Why: tokens sitting in RAM are vulnerable to a device that gets
/// unlocked by someone else, or a memory-scrape on a compromised OS.
/// After a long background, we discard in-memory copies so the only
/// place tokens live is the OS Keychain / Keystore.
///
/// This class does NOT delete the tokens from secure storage. It only
/// triggers an in-app logout event that downstream providers can react
/// to (e.g. by clearing their cached user object).
class LifecycleService with WidgetsBindingObserver {
  static const _wipeAfter = Duration(seconds: 60);

  final void Function() onLongBackground;
  DateTime? _backgroundedAt;
  Timer? _timer;

  LifecycleService({required this.onLongBackground}) {
    WidgetsBinding.instance.addObserver(this);
  }

  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden) {
      _backgroundedAt = DateTime.now();
      _timer?.cancel();
      _timer = Timer(_wipeAfter, _maybeWipe);
    } else if (state == AppLifecycleState.resumed) {
      _timer?.cancel();
      _timer = null;
      _backgroundedAt = null;
    }
  }

  void _maybeWipe() {
    final started = _backgroundedAt;
    if (started == null) return;
    final elapsed = DateTime.now().difference(started);
    if (elapsed >= _wipeAfter) {
      onLongBackground();
    }
  }

  /// Kept for symmetry - call this from main() to remove any sensitive
  /// values that might have been left behind by a crash.
  static Future<void> clearLegacyStorage() async {
    const storage = FlutterSecureStorage();
    // No-op for now. Placeholder for future cleanup routines.
    await storage.read(key: '__noop__');
  }
}