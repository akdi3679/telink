import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/role.dart';
import '../providers/auth_providers.dart';
import '../providers/signup_providers.dart';

class SignupProfilePage extends ConsumerStatefulWidget {
  const SignupProfilePage({super.key});

  @override
  ConsumerState<SignupProfilePage> createState() => _SignupProfilePageState();
}

class _SignupProfilePageState extends ConsumerState<SignupProfilePage> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _jobTitle = TextEditingController();
  String? _role;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _jobTitle.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final first = _firstName.text.trim();
    final last = _lastName.text.trim();
    final job = _jobTitle.text.trim();

    if (first.isEmpty || last.isEmpty) {
      setState(() => _error = 'First name and last name are required');
      return;
    }
    if (_role == null) {
      setState(() => _error = 'Please pick a role');
      return;
    }
    if (job.isEmpty) {
      setState(() => _error = 'Job title is required');
      return;
    }

    final flow = ref.read(signupFlowProvider);
    if (flow.signupToken == null || flow.password.isEmpty) {
      setState(() => _error = 'Missing session. Restart signup.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      ref.read(signupFlowProvider.notifier).setProfileFields(
            firstName: first,
            lastName: last,
            role: _role!,
            jobTitle: job,
          );
      final result = await ref.read(authRepositoryProvider).signupComplete(
            signupToken: flow.signupToken!,
            password: flow.password,
            firstName: first,
            lastName: last,
            role: _role!,
            jobTitle: job,
          );
      await ref.read(authProvider.notifier).setSession(result);
      ref.read(signupFlowProvider.notifier).reset();
      if (!mounted) return;
      // Router redirect handles navigation to /home.
    } catch (e) {
      setState(() => _error = 'Could not create account. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your profile')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Almost done',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text('Tell us a bit about yourself.'),
              const SizedBox(height: 24),
              TextField(
                controller: _firstName,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'First name',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _lastName,
                decoration: const InputDecoration(
                  labelText: 'Last name',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _role,
                decoration: const InputDecoration(
                  labelText: 'Role',
                  border: OutlineInputBorder(),
                ),
                items: kRoles
                    .map((r) => DropdownMenuItem(
                          value: r.value,
                          child: Text(r.label),
                        ))
                    .toList(),
                onChanged: (v) => setState(() => _role = v),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _jobTitle,
                decoration: const InputDecoration(
                  labelText: 'Job title',
                  hintText: 'e.g. Software Engineer',
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
                    : const Text('Finish'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}