import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/recovery_repository.dart';
import 'auth_providers.dart';

final recoveryRepositoryProvider = Provider<RecoveryRepository>((ref) {
  return RecoveryRepository(
    ref.read(dioClientProvider).dio,
    ref.read(secureStorageProvider),
  );
});

final recoveryStatusProvider = FutureProvider<RecoveryStatus>((ref) async {
  return ref.read(recoveryRepositoryProvider).status();
});