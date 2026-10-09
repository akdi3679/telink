import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/profile_providers.dart';

class ProfileEditPage extends ConsumerStatefulWidget {
  const ProfileEditPage({super.key});

  @override
  ConsumerState<ProfileEditPage> createState() => _ProfileEditPageState();
}

class _ProfileEditPageState extends ConsumerState<ProfileEditPage> {
  final _headline = TextEditingController();
  final _bio = TextEditingController();
  final _workTitle = TextEditingController();
  final _workCompany = TextEditingController();
  final _city = TextEditingController();
  final _country = TextEditingController();
  final _languages = TextEditingController();
  final _categories = TextEditingController();

  bool _loading = false;
  bool _seeded = false;
  String? _error;

  @override
  void dispose() {
    _headline.dispose();
    _bio.dispose();
    _workTitle.dispose();
    _workCompany.dispose();
    _city.dispose();
    _country.dispose();
    _languages.dispose();
    _categories.dispose();
    super.dispose();
  }

  void _seed() {
    if (_seeded) return;
    final p = ref.read(myProfileProvider).valueOrNull?.profile;
    if (p == null) return;
    _headline.text = p.headline ?? '';
    _bio.text = p.bio ?? '';
    _workTitle.text = p.workTitle ?? '';
    _workCompany.text = p.workCompany ?? '';
    _city.text = p.city ?? '';
    _country.text = p.country ?? '';
    _languages.text = p.languages.join(', ');
    _categories.text = p.categories.join(', ');
    _seeded = true;
  }

  List<String> _splitCsv(String s) =>
      s.split(',').map((x) => x.trim()).where((x) => x.isNotEmpty).toList();

  Future<void> _save() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(profileRepositoryProvider).update({
        'headline': _headline.text.trim(),
        'bio': _bio.text.trim(),
        'workTitle': _workTitle.text.trim(),
        'workCompany': _workCompany.text.trim(),
        'city': _city.text.trim(),
        'country': _country.text.trim(),
        'languages': _splitCsv(_languages.text),
        'categories': _splitCsv(_categories.text),
      });
      ref.invalidate(myProfileProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = 'Could not save. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Seed once when data is ready
    ref.watch(myProfileProvider);
    _seed();

    return Scaffold(
      appBar: AppBar(title: const Text('Edit profile')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            TextField(
              controller: _headline,
              maxLength: 120,
              decoration: const InputDecoration(
                labelText: 'Headline',
                hintText: 'e.g. Software Engineer in Tunis',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _bio,
              maxLines: 4,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'Bio',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _workTitle,
              decoration: const InputDecoration(
                labelText: 'Work title',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _workCompany,
              decoration: const InputDecoration(
                labelText: 'Work company',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _city,
              decoration: const InputDecoration(
                labelText: 'City',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _country,
              decoration: const InputDecoration(
                labelText: 'Country',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _languages,
              decoration: const InputDecoration(
                labelText: 'Languages (comma separated)',
                hintText: 'Arabic, French, English',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _categories,
              decoration: const InputDecoration(
                labelText: 'Categories (comma separated)',
                hintText: 'engineering, design',
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
              onPressed: _loading ? null : _save,
              style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16)),
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}