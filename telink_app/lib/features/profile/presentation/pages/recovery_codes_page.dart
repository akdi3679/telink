import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/presentation/providers/recovery_providers.dart';
import '../stepup_actions.dart';

class RecoveryCodesPage extends ConsumerWidget {
  const RecoveryCodesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(recoveryStatusProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Recovery codes')),
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
                Text('Could not load status.\n$e',
                    textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(recoveryStatusProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (status) => _Body(status: status),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final dynamic status;
  const _Body({required this.status});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final remaining = status.remaining as int;
    final total = status.total as int;
    final generatedAt = status.generatedAt as DateTime?;
    final hasCodes = total > 0;

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Icon(Icons.shield_outlined,
            size: 64, color: theme.colorScheme.primary),
        const SizedBox(height: 16),
        Text('Recovery codes',
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineSmall),
        const SizedBox(height: 12),
        Text(
          'If you forget your password and lose access to your passkeys, '
          'a recovery code gets you back into your account. Save them '
          'somewhere safe. Each code can only be used once.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 32),
        if (hasCodes)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        remaining > 3
                            ? Icons.check_circle
                            : Icons.warning_amber,
                        color: remaining > 3 ? Colors.green : Colors.orange,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          '$remaining of $total codes remaining',
                          style: theme.textTheme.titleMedium,
                        ),
                      ),
                    ],
                  ),
                  if (generatedAt != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Last generated: ${_fmt(generatedAt)}',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ],
              ),
            ),
          ),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: () => _generate(context, ref),
          icon: const Icon(Icons.refresh),
          label: Text(hasCodes ? 'Regenerate codes' : 'Generate codes'),
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
        ),
        if (hasCodes) ...[
          const SizedBox(height: 12),
          Text(
            'Regenerating invalidates all existing codes. Use this only if '
            'you have lost your current codes or think they are compromised.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ],
    );
  }

  static String _fmt(DateTime d) {
    final t = d.toLocal();
    return '${t.year}-${_two(t.month)}-${_two(t.day)} '
        '${_two(t.hour)}:${_two(t.minute)}';
  }

  static String _two(int n) => n.toString().padLeft(2, '0');

  Future<void> _generate(BuildContext context, WidgetRef ref) async {
    // High-risk action: ask the user to verify it is them first.
    if (!context.mounted) return;
    final verified = await requireStepUp(context, ref);
    if (!verified) return;
    if (!context.mounted) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Regenerate recovery codes?'),
        content: const Text(
          'This will invalidate all existing recovery codes. Make sure you '
          'have your old codes saved somewhere if you still need them.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Regenerate'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    try {
      final codes = await ref.read(recoveryRepositoryProvider).generate();
      if (context.mounted) Navigator.of(context).pop();
      if (context.mounted) await _showCodesDialog(context, codes);
      ref.invalidate(recoveryStatusProvider);
    } catch (e) {
      if (context.mounted) Navigator.of(context).pop();
      messenger.showSnackBar(
        SnackBar(content: Text('Could not generate: $e')),
      );
    }
  }

  Future<void> _showCodesDialog(
      BuildContext context, List<String> codes) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _CodesDialog(codes: codes),
    );
  }
}

class _CodesDialog extends StatelessWidget {
  final List<String> codes;
  const _CodesDialog({required this.codes});

  String _format(String raw) {
    final b = StringBuffer();
    for (var i = 0; i < raw.length; i++) {
      if (i > 0 && i % 4 == 0) b.write('-');
      b.write(raw[i]);
    }
    return b.toString();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text('Save these codes'),
      content: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'These codes are shown only once. Save them somewhere safe '
              '(password manager, printed paper, encrypted note). Each code '
              'works a single time.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: codes
                    .map((c) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: SelectableText(
                            _format(c),
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 15,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ))
                    .toList(),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton.icon(
          onPressed: () {
            final text = codes.map(_format).join('\n');
            Clipboard.setData(ClipboardData(text: text));
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Codes copied. Clipboard clears in 60s.'),
              ),
            );
          },
          icon: const Icon(Icons.copy, size: 18),
          label: const Text('Copy all'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text("I've saved them"),
        ),
      ],
    );
  }
}