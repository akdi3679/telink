import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_providers.dart';
import '../providers/recovery_providers.dart';

class ForgotPasswordPage extends ConsumerStatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  ConsumerState<ForgotPasswordPage> createState() =>
      _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends ConsumerState<ForgotPasswordPage> {
  int _step = 0; // 0 = email+code, 1 = new password

  final _email = TextEditingController();
  final _code = TextEditingController();
  final _pwd = TextEditingController();
  final _pwdConfirm = TextEditingController();

  String? _resetToken;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _pwd.dispose();
    _pwdConfirm.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final email = _email.text.trim();
    final code = _code.text.trim();
    if (email.isEmpty || code.isEmpty) {
      setState(() => _error = 'Enter email and a recovery code');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final token = await ref
          .read(recoveryRepositoryProvider)
          .verify(email, code);
      setState(() {
        _resetToken = token;
        _step = 1;
      });
    } catch (e) {
      final s = e.toString().toLowerCase();
      String msg = 'Invalid email or recovery code';
      if (s.contains('429') || s.contains('too many')) {
        msg = 'Too many attempts. Try again later.';
      }
      setState(() => _error = msg);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _complete() async {
    final pwd = _pwd.text;
    final confirm = _pwdConfirm.text;
    if (pwd.length < 8 ||
        !RegExp(r'[A-Za-z]').hasMatch(pwd) ||
        !RegExp(r'\d').hasMatch(pwd)) {
      setState(() =>
          _error = 'At least 8 characters, with a letter and a number');
      return;
    }
    if (pwd != confirm) {
      setState(() => _error = 'Passwords do not match');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(recoveryRepositoryProvider)
          .complete(_resetToken!, pwd);
      await ref.read(authProvider.notifier).setSession(result);
      // Router redirect moves to /home automatically.
    } catch (e) {
      setState(() => _error = 'Could not reset password. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_step == 0 ? 'Reset password' : 'Set new password'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: _step == 0 ? _step0() : _step1(),
        ),
      ),
    );
  }

  Widget _step0() {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Enter your email and a recovery code',
            style: theme.textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(
          'Use one of the codes you saved when you created your account.',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autofocus: true,
          enabled: !_loading,
          decoration: const InputDecoration(
            labelText: 'Email',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _code,
          textCapitalization: TextCapitalization.characters,
          enabled: !_loading,
          decoration: const InputDecoration(
            labelText: 'Recovery code',
            hintText: 'XXXX-XXXX-XXXX',
            border: OutlineInputBorder(),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _loading ? null : _verify,
          style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16)),
          child: _loading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Continue'),
        ),
      ],
    );
  }

  Widget _step1() {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Choose a new password', style: theme.textTheme.titleLarge),
        const SizedBox(height: 8),
        Text('At least 8 characters, with a letter and a number.',
            style: theme.textTheme.bodyMedium),
        const SizedBox(height: 24),
        TextField(
          controller: _pwd,
          obscureText: true,
          autofocus: true,
          enabled: !_loading,
          decoration: const InputDecoration(
            labelText: 'New password',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _pwdConfirm,
          obscureText: true,
          enabled: !_loading,
          decoration: const InputDecoration(
            labelText: 'Confirm new password',
            border: OutlineInputBorder(),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _loading ? null : _complete,
          style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16)),
          child: _loading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Reset password'),
        ),
      ],
    );
  }
}