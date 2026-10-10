import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/security/passkey_error.dart';
import '../../../../core/security/webauthn_client.dart';
import '../../data/passkey_repository.dart';
import '../providers/passkey_providers.dart';
import '../stepup_actions.dart';

class PasskeysPage extends ConsumerWidget {
  const PasskeysPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(passkeyListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Passkeys'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(passkeyListProvider),
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
                Text('Could not load passkeys.\n$e',
                    textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(passkeyListProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (list) => _Body(list: list),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _onAdd(context, ref),
        icon: const Icon(Icons.add),
        label: Text(
          (async.valueOrNull?.isEmpty ?? true) ? 'Add passkey' : 'Add another',
        ),
      ),
    );
  }
}

/// Tapping "Add passkey" on desktop/web runs the WebAuthn flow.
/// On mobile (Android/iOS), the native passkey API is not wired yet,
/// so we show an honest "coming soon" sheet.
Future<void> _onAdd(BuildContext context, WidgetRef ref) async {
  if (kIsWeb) {
    await _showAddDialog(context, ref);
    return;
  }
  await showModalBottomSheet(
    context: context,
    showDragHandle: true,
    builder: (_) => const _NativeComingSoonSheet(),
  );
}

class _NativeComingSoonSheet extends StatelessWidget {
  const _NativeComingSoonSheet();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.fingerprint, size: 32, color: theme.colorScheme.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Native passkeys on mobile',
                  style: theme.textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Chip(
            label: const Text('Coming next', style: TextStyle(fontSize: 12)),
            backgroundColor: Colors.amber.shade100,
            side: BorderSide.none,
          ),
          const SizedBox(height: 16),
          Text(
            'Passkeys work today on the web build (your browser asks you to '
            'use Windows Hello, a security key, or your phone).',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 12),
          Text(
            'On this phone, we will next integrate Android\'s native Credential '
            'Manager so you can register a passkey with your fingerprint or '
            'face. That is one more session of work.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'Meanwhile you can sign in with your email and password, and use '
              'all other security features on this device.',
              style: theme.textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final List<PasskeyRecord> list;
  const _Body({required this.list});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (list.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.key_outlined, size: 64),
              SizedBox(height: 16),
              Text(
                'No passkeys yet',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
              ),
              SizedBox(height: 8),
              Text(
                'Add a passkey to sign in without a password. Your private key stays on your device  nothing is shared with Telink.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    final needsBackup = list.length == 1;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (needsBackup) ...[
          Card(
            color: Colors.amber.shade50,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.shield_outlined,
                      color: Colors.orange, size: 32),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Add a backup passkey',
                          style: TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'You only have one passkey. If you lose that '
                          'device, you will not be able to sign in with a '
                          'passkey until you add another.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
        ...list.map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                child: ListTile(
                  leading: const Icon(Icons.vpn_key_outlined),
                  title: Text(p.name ?? 'Passkey'),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Added: ${_fmt(p.createdAt)}'),
                      if (p.lastUsedAt != null)
                        Text('Last used: ${_fmt(p.lastUsedAt!)}'),
                    ],
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => _confirmDelete(context, ref, p),
                  ),
                ),
              ),
            )),
      ],
    );
  }

  static String _fmt(DateTime d) {
    final t = d.toLocal();
    return '${t.year}-${_two(t.month)}-${_two(t.day)} '
        '${_two(t.hour)}:${_two(t.minute)}';
  }

  static String _two(int n) => n.toString().padLeft(2, '0');

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    PasskeyRecord p,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this passkey?'),
        content: Text(
            'You will no longer be able to use "${p.name ?? 'this passkey'}" to sign in.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!context.mounted) return;

    final verified = await requireStepUp(context, ref);
    if (!verified) return;
    if (!context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);

    try {
      await ref.read(passkeyRepositoryProvider).delete(p.id);
      ref.invalidate(passkeyListProvider);
      await ref.read(passkeyListProvider.future);
      messenger.showSnackBar(
        const SnackBar(content: Text('Passkey removed')),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(describePasskeyError(e).message)),
      );
    }
  }
}

Future<void> _showAddDialog(BuildContext context, WidgetRef ref) async {
  final verified = await requireStepUp(context, ref);
  if (!verified) return;
  if (!context.mounted) return;

  final controller = TextEditingController();
  final name = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Name this passkey'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: controller,
            autofocus: true,
            decoration: const InputDecoration(
              hintText: 'e.g. My laptop, Work YubiKey',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Your browser will ask you to use Windows Hello, a security key, or your phone.',
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(ctx).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
          child: const Text('Continue'),
        ),
      ],
    ),
  );
  if (name == null || name.isEmpty) return;
  if (!context.mounted) return;

  final messenger = ScaffoldMessenger.of(context);
  showDialog(
    context: context,
    barrierDismissible: false,
    builder: (_) => const Center(child: CircularProgressIndicator()),
  );

  try {
    final repo = ref.read(passkeyRepositoryProvider);
    final options = await repo.beginRegistration(name);

    final client = WebAuthnClient();
    final response = await client.register(options);

    await repo.finishRegistration(response);
    ref.invalidate(passkeyListProvider);
    await ref.read(passkeyListProvider.future);

    if (context.mounted) Navigator.of(context).pop();
    messenger.showSnackBar(
      const SnackBar(content: Text('Passkey added')),
    );
  } catch (e) {
    if (context.mounted) Navigator.of(context).pop();
    messenger.showSnackBar(
      SnackBar(content: Text(describePasskeyError(e).message)),
    );
  }
}