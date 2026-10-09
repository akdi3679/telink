import 'dart:async';
import 'package:flutter/services.dart';

/// Auto-clears the clipboard N seconds after we write sensitive data.
///
/// Usage:
///   await ClipboardService.copySensitive('my-secret-token');
///
/// After 60 seconds the clipboard is set to an empty string (best effort).
/// If the user copied something else in the meantime, we do NOT clobber it.
class ClipboardService {
  static const _clearAfter = Duration(seconds: 60);
  static String? _lastCopied;
  static Timer? _timer;

  static Future<void> copySensitive(String value) async {
    _timer?.cancel();
    _lastCopied = value;
    await Clipboard.setData(ClipboardData(text: value));

    _timer = Timer(_clearAfter, () async {
      try {
        final current = await Clipboard.getData(Clipboard.kTextPlain);
        // Only clear if the clipboard still holds what we wrote.
        if (current?.text == _lastCopied) {
          await Clipboard.setData(const ClipboardData(text: ''));
        }
      } catch (_) {
        // Best-effort; some platforms restrict clipboard access.
      } finally {
        _lastCopied = null;
      }
    });
  }

  static void cancel() {
    _timer?.cancel();
    _timer = null;
    _lastCopied = null;
  }
}