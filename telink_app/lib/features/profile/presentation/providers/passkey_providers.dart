import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/passkey_repository.dart';

final passkeyRepositoryProvider = Provider<PasskeyRepository>((ref) {
  return PasskeyRepository(ref.read(dioClientProvider).dio);
});

final passkeyListProvider = FutureProvider<List<PasskeyRecord>>((ref) async {
  return ref.read(passkeyRepositoryProvider).list();
});