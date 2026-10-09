import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/login_history_repository.dart';

final loginHistoryRepositoryProvider = Provider<LoginHistoryRepository>((ref) {
  return LoginHistoryRepository(ref.read(dioClientProvider).dio);
});

final loginHistoryProvider = FutureProvider<List<LoginAttempt>>((ref) async {
  return ref.read(loginHistoryRepositoryProvider).list();
});