import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/security/secure_storage_audit.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Verify secure storage is functional before starting the app.
  // If it is not, the app will still start but tokens will not persist.
  final secureOk = await SecureStorageAudit.isAvailable();
  if (!secureOk) {
    // Not fatal in dev; we want to know about it in release.
    debugPrint('WARNING: secure storage unavailable');
  }

  runApp(const ProviderScope(child: TelinkApp()));
}