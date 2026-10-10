import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/sessions_repository.dart';

final sessionsRepositoryProvider = Provider<SessionsRepository>((ref) {
  return SessionsRepository(ref.read(dioClientProvider).dio);
});

final sessionsListProvider = FutureProvider<List<SessionRow>>((ref) async {
  return ref.read(sessionsRepositoryProvider).list();
});