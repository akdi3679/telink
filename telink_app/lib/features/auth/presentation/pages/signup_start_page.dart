import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/routing/routes.dart';
import '../providers/auth_providers.dart';
import '../providers/signup_providers.dart';

class SignupStartPage extends ConsumerStatefulWidget {
  const SignupStartPage({super.key});

  @override
  ConsumerState<SignupStartPage> createState() => _SignupStartPageState();
}

class _SignupStartPageState extends ConsumerState<SignupStartPage> {
  final _phone = TextEditingController(text: '+216');
  final _email = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final phone = _phone.text.trim();
    final email = _email.text.trim();

    if (!RegExp(r'^\+?[1-9]\d{6,14}$').hasMatch(phone)) {
      setState(() => _error = 'Enter a valid phone in E.164 format (+216...)');
      return;
    }
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
      setState(() => _error = 'Enter a valid email');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final id = await ref.read(authRepositoryProvider).signupStart(phone, email);
      ref.read(signupFlowProvider.notifier).setStart(phone, email, id);
      if (!mounted) return;
      context.go(Routes.signupOtp);
    } catch (e) {
      setState(() => _error = 'Signup failed. Phone or email may be in use.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Start with your phone and email',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text('We will send a verification code to your email.'),
              const SizedBox(height: 24),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Phone',
                  hintText: '+21612345678',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  hintText: 'you@example.com',
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
                onPressed: _loading ? null : _submit,
                style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16)),
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Send code'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}