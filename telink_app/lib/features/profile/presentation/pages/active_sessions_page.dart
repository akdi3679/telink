import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/sessions_repository.dart';
import '../providers/sessions_providers.dart';
import '../stepup_actions.dart';

class ActiveSessionsPage extends ConsumerWidget {
  const ActiveSessionsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(sessionsListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Active sessions'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(sessionsListProvider),
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
                Text('Could not load sessions.\n$e',
                    textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(sessionsListProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (list) => _Body(list: list),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final List<SessionRow> list;
  const _Body({required this.list});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final others = list.where((s) => !s.isCurrent).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'You are signed in on ${list.length} '
          '${list.length == 1 ? 'device' : 'devices'}.',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 12),

        if (others.isNotEmpty)
          Card(
            color: theme.colorScheme.surfaceContainerHighest,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.warning_amber_rounded,
                          color: theme.colorScheme.primary, size: 24),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${others.length} other '
                          '${others.length == 1 ? 'session is' : 'sessions are'} '
                          'active',
                          style: theme.textTheme.titleSmall,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'If you do not recognize any of these, sign out everywhere '
                    'and change your password.',
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => _confirmRevokeOthers(context, ref),
                      icon: const Icon(Icons.logout, size: 18),
                      label: const Text('Sign out of all other sessions'),
                    ),
                  ),
                ],
              ),
            ),
          ),

        if (others.isNotEmpty) const SizedBox(height: 16),

        ...list.map(
          (s) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _SessionCard(session: s),
          ),
        ),
      ],
    );
  }

  Future<void> _confirmRevokeOthers(
      BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out other sessions?'),
        content: const Text(
          'Every other device will be signed out. Your current session stays active.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sign out others'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!context.mounted) return;

    // Step-up for this high-risk action.
    final verified = await requireStepUp(context, ref);
    if (!verified) return;
    if (!context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      final n = await ref.read(sessionsRepositoryProvider).revokeOthers();
      ref.invalidate(sessionsListProvider);
      messenger.showSnackBar(
        SnackBar(content: Text('Signed out of $n other session(s).')),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text('Failed: $e')),
      );
    }
  }
}

class _SessionCard extends ConsumerWidget {
  final SessionRow session;
  const _SessionCard({required this.session});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    final deviceLabel = _deviceLabel(session.userAgent);
    final place = [session.geoCity, session.geoCountry]
        .where((s) => s != null && s.isNotEmpty)
        .join(', ');

    return Card(
      color: session.isCurrent
          ? theme.colorScheme.primaryContainer.withValues(alpha: 0.4)
          : null,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              session.isCurrent ? Icons.phone_iphone : Icons.devices_other,
              color: session.isCurrent ? theme.colorScheme.primary : null,
              size: 28,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          deviceLabel,
                          style: theme.textTheme.titleSmall,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (session.isCurrent) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'Current',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: theme.colorScheme.onPrimary,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  if (place.isNotEmpty)
                    Text(place, style: theme.textTheme.bodySmall),
                  if (session.ip != null && session.ip!.isNotEmpty)
                    Text('IP: ${session.ip}',
                        style: theme.textTheme.bodySmall),
                  Text(
                    'Last active: ${_fmt(session.lastSeenAt)}',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            if (!session.isCurrent)
              IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () => _confirmRevoke(context, ref),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmRevoke(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out this session?'),
        content: const Text(
            'That device will need to sign in again to access your account.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(sessionsRepositoryProvider).revoke(session.id);
      ref.invalidate(sessionsListProvider);
      messenger.showSnackBar(
        const SnackBar(content: Text('Session signed out')),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text('Failed: $e')),
      );
    }
  }

  static String _deviceLabel(String? ua) {
    if (ua == null || ua.isEmpty) return 'Unknown device';
    final lower = ua.toLowerCase();
    if (lower.contains('android')) return 'Android device';
    if (lower.contains('iphone') || lower.contains('ipad')) return 'iOS device';
    if (lower.contains('windows')) return 'Windows';
    if (lower.contains('macintosh') || lower.contains('mac os'))
      return 'Mac';
    if (lower.contains('linux')) return 'Linux';
    if (lower.contains('chrome')) return 'Chrome';
    if (lower.contains('firefox')) return 'Firefox';
    return 'Unknown device';
  }

  static String _fmt(DateTime d) {
    final t = d.toLocal();
    final now = DateTime.now();
    final diff = now.difference(t);

    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours} h ago';
    if (diff.inDays < 7) return '${diff.inDays} d ago';

    return '${t.year}-${_two(t.month)}-${_two(t.day)} '
        '${_two(t.hour)}:${_two(t.minute)}';
  }

  static String _two(int n) => n.toString().padLeft(2, '0');
}
