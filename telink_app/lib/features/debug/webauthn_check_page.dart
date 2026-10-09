import 'package:flutter/material.dart';
import '../../core/security/webauthn_probe.dart';

class WebAuthnCheckPage extends StatefulWidget {
  const WebAuthnCheckPage({super.key});

  @override
  State<WebAuthnCheckPage> createState() => _WebAuthnCheckPageState();
}

class _WebAuthnCheckPageState extends State<WebAuthnCheckPage> {
  WebAuthnProbeResult? _result;
  bool? _platformAuthenticator;
  bool _loading = false;

  Future<void> _check() async {
    setState(() => _loading = true);
    final r = probeWebAuthn();
    bool? pa;
    if (r.supported) {
      pa = await platformAuthenticatorAvailable();
    }
    if (!mounted) return;
    setState(() {
      _result = r;
      _platformAuthenticator = pa;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('WebAuthn check')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'This checks whether this browser can use WebAuthn (passkeys).',
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _loading ? null : _check,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Run check'),
            ),
            const SizedBox(height: 24),
            if (_result != null)
              _ResultCard(
                result: _result!,
                platformAuth: _platformAuthenticator,
              ),
            const SizedBox(height: 24),
            const Text(
              'Legend:\n'
              '  Green  = the browser exposes this API\n'
              '  Red    = the API is missing (WebAuthn unusable)\n\n'
              'If all four lines are green, we can build the passkey UI.',
              style: TextStyle(fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  final WebAuthnProbeResult result;
  final bool? platformAuth;
  const _ResultCard({required this.result, this.platformAuth});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _line('Secure context (HTTPS or localhost)', result.secureContext),
            _line('PublicKeyCredential API', result.pkcSupported),
            _line('navigator.credentials API', result.credentialsSupported),
            if (platformAuth != null)
              _line('Device has platform authenticator', platformAuth!),
            const Divider(height: 24),
            Text(
              result.reason,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: result.supported ? Colors.green[700] : Colors.red[700],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _line(String label, bool ok) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(
            ok ? Icons.check_circle : Icons.cancel,
            color: ok ? Colors.green : Colors.red,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(label)),
        ],
      ),
    );
  }
}