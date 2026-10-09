/// Maps raw WebAuthn/DOMException errors into user-friendly text.
///
/// Returns a short string plus a boolean indicating whether the user
/// should be guided toward password login.
({String message, bool suggestPassword}) describePasskeyError(Object? error) {
  if (error == null) {
    return (message: 'Passkey failed. Try again.', suggestPassword: false);
  }
  final s = error.toString().toLowerCase();

  if (s.contains('cancel') || s.contains('abort')) {
    return (message: 'Passkey was cancelled', suggestPassword: false);
  }
  if (s.contains('notallowed')) {
    // NotAllowedError covers timeout, cancelled, and other user-agent
    // refusals. Give a neutral message.
    return (
      message: 'Passkey was cancelled or timed out.',
      suggestPassword: false,
    );
  }
  if (s.contains('timeout')) {
    return (message: 'Passkey timed out. Try again.', suggestPassword: false);
  }
  if (s.contains('securityerror') || s.contains('secure context')) {
    return (message: 'Passkey requires HTTPS or localhost.', suggestPassword: false);
  }
  if (s.contains('invalidstate')) {
    return (
      message: 'This device already has a passkey for your account.',
      suggestPassword: false,
    );
  }
  if (s.contains('notsupported') || s.contains('unsupported')) {
    return (
      message: 'This device or browser does not support passkeys.',
      suggestPassword: false,
    );
  }
  if (s.contains('unknown passkey') ||
      s.contains('unknown_passkey') ||
      s.contains('credential not found')) {
    return (
      message:
          'This passkey is not registered with any Telink account on this device.',
      suggestPassword: true,
    );
  }
  if (s.contains('network') || s.contains('offline')) {
    return (
      message: 'Network issue. Check your connection and try again.',
      suggestPassword: false,
    );
  }
  if (s.contains('already registered')) {
    return (
      message: 'This device already has a passkey. Use a different device.',
      suggestPassword: false,
    );
  }
  return (
    message: 'Could not complete passkey. Try again or use a different method.',
    suggestPassword: true,
  );
}