import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/login_history_repository.dart';
import '../providers/login_history_providers.dart';

class LoginHistoryPage extends ConsumerWidget {
  const LoginHistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(loginHistoryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Login activity'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(loginHistoryProvider),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48),
                const SizedBox(height: 12),
                Text('Could not load.\n$e', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(loginHistoryProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.history, size: 64),
                    SizedBox(height: 16),
                    Text(
                      'No activity yet',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Recent sign-in attempts will appear here.',
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: list.length,
            itemBuilder: (context, i) => _AttemptCard(attempt: list[i]),
          );
        },
      ),
    );
  }
}

class _AttemptCard extends StatelessWidget {
  final LoginAttempt attempt;
  const _AttemptCard({required this.attempt});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (icon, color, label) = _describe(attempt);

    final place = [attempt.geoCity, attempt.geoCountry]
        .where((s) => s != null && s.isNotEmpty)
        .join(', ');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _fmt(attempt.createdAt),
                    style: theme.textTheme.bodySmall,
                  ),
                  if (place.isNotEmpty)
                    Text(
                      place,
                      style: theme.textTheme.bodySmall,
                    ),
                  if (attempt.ip != null && attempt.ip!.isNotEmpty)
                    Text(
                      'IP: ${attempt.ip}',
                      style: theme.textTheme.bodySmall,
                    ),
                  if (attempt.isImpossible) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Distance: ${attempt.details['distanceKm'] ?? '?'} km in '
                      '${attempt.details['elapsedSeconds'] ?? '?'}s',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: Colors.red.shade700),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static (IconData, Color, String) _describe(LoginAttempt a) {
    if (a.isImpossible) {
      return (
        Icons.warning_amber,
        Colors.red.shade700,
        'Suspicious sign-in flagged',
      );
    }
    if (a.isNewDevice) {
      return (
        Icons.phone_iphone,
        Colors.orange.shade700,
        'New device sign-in',
      );
    }
    if (a.isSuccess) {
      return (Icons.check_circle, Colors.green.shade700, 'Signed in');
    }
    if (a.isFailure) {
      return (Icons.cancel, Colors.red.shade700, 'Failed sign-in attempt');
    }
    return (Icons.info_outline, Colors.grey, a.action);
  }

  static String _fmt(DateTime d) {
    final t = d.toLocal();
    return '${t.year}-${_two(t.month)}-${_two(t.day)} '
        '${_two(t.hour)}:${_two(t.minute)}';
  }

  static String _two(int n) => n.toString().padLeft(2, '0');
}