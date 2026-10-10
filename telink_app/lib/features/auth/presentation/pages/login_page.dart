import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/env/env.dart';
import '../../../../core/routing/routes.dart';
import '../../../../core/security/passkey_error.dart';
import '../providers/auth_providers.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  bool _passkeyLoading = false;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final id = _identifier.text.trim();
    final pwd = _password.text;
    if (id.isEmpty || pwd.isEmpty) {
      setState(() => _error = 'Enter email/phone and password');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).login(id, pwd);
    } catch (e) {
      setState(() => _error = 'Invalid email/phone or password');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitPasskey() async {
    final id = _identifier.text.trim();
    setState(() {
      _passkeyLoading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).loginWithPasskey(
            identifier: id.isEmpty ? null : id,
          );
    } catch (e) {
      if (!mounted) return;
      final described = describePasskeyError(e);
      setState(() => _error = described.message);
      if (described.suggestPassword && mounted) {
        // Point the user at password login below.
        _showPasskeyHelpDialog();
      }
    } finally {
      if (mounted) setState(() => _passkeyLoading = false);
    }
  }

  void _showPasskeyHelpDialog() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign in with password?'),
        content: const Text(
          'The passkey on this device is not linked to a Telink account. '
          'You can sign in with your email/phone and password instead, '
          'then add a fresh passkey from Profile → Security → Passkeys.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const showPasskey = kIsWeb;
    final busy = _loading || _passkeyLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Welcome back', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 24),
              TextField(
                controller: _identifier,
                autofocus: true,
                enabled: !busy,
                decoration: const InputDecoration(
                  labelText: 'Email or phone',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _password,
                obscureText: true,
                enabled: !busy,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: busy
                      ? null
                      : () => context.push(Routes.forgotPassword),
                  child: const Text('Forgot password?',
                      style: TextStyle(fontSize: 13)),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!,
                    style: TextStyle(color: theme.colorScheme.error)),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: busy ? null : _submit,
                style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16)),
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Sign in'),
              ),
              if (showPasskey) ...[
                const SizedBox(height: 24),
                Row(
                  children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text('or', style: theme.textTheme.bodySmall),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: busy ? null : _submitPasskey,
                  icon: _passkeyLoading
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.fingerprint),
                  label: const Text('Sign in with a passkey'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'A passkey is not a password. Your browser will ask you '
                  'to use Windows Hello, a security key, or your phone.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
              const SizedBox(height: 24),
              const SizedBox(height: 8),
              // DEBUG ONLY: shows which API this build was compiled against.
              // Remove once mobile builds are stable.
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: Colors.black12,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  'API: ${Env.apiUrl}',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 10, fontFamily: 'monospace'),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => context.push(Routes.debugWebauthn),
                child: const Text(
                  'Check WebAuthn support (debug)',
                  style: TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}