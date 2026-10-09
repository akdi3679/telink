import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/routing/app_router.dart';
import 'core/security/lifecycle_service.dart';

class TelinkApp extends ConsumerStatefulWidget {
  const TelinkApp({super.key});

  @override
  ConsumerState<TelinkApp> createState() => _TelinkAppState();
}

class _TelinkAppState extends ConsumerState<TelinkApp> {
  late final LifecycleService _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = LifecycleService(
      onLongBackground: () {
        // Wipe in-memory auth state. The user must re-authenticate after
        // returning, even though tokens may still be in secure storage.
        // For v1 we log this event; later phases hook into the auth notifier.
        debugPrint('[Lifecycle] long background - wiping in-memory state');
      },
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Telink',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF4A6CF7),
        ),
      ),
      routerConfig: router,
    );
  }
}