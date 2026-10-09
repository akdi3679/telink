import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/routing/routes.dart';
import '../providers/signup_providers.dart';

class SignupPasswordPage extends ConsumerStatefulWidget {
  const SignupPasswordPage({super.key});

  @override
  ConsumerState<SignupPasswordPage> createState() => _SignupPasswordPageState();
}

class _SignupPasswordPageState extends ConsumerState<SignupPasswordPage> {
  final _pwd = TextEditingController();
  final _confirm = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _pwd.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _submit() {
    final pwd = _pwd.text;
    final confirm = _confirm.text;

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

    ref.read(signupFlowProvider.notifier).setPassword(pwd);
    context.go(Routes.signupProfile);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Choose a password',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text('At least 8 characters, with a letter and a number.'),
              const SizedBox(height: 24),
              TextField(
                controller: _pwd,
                obscureText: true,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _confirm,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Confirm password',
                  border: OutlineInputBorder(),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!,
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _submit,
                style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16)),
                child: const Text('Continue'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}