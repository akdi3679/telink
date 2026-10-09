import 'package:flutter_riverpod/flutter_riverpod.dart';

class SignupFlowState {
  final String phone;
  final String email;
  final String? signupId;
  final String? signupToken;
  final String password;
  final String firstName;
  final String lastName;
  final String? role;
  final String jobTitle;

  const SignupFlowState({
    this.phone = '',
    this.email = '',
    this.signupId,
    this.signupToken,
    this.password = '',
    this.firstName = '',
    this.lastName = '',
    this.role,
    this.jobTitle = '',
  });

  SignupFlowState copyWith({
    String? phone,
    String? email,
    String? signupId,
    String? signupToken,
    String? password,
    String? firstName,
    String? lastName,
    String? role,
    String? jobTitle,
  }) =>
      SignupFlowState(
        phone: phone ?? this.phone,
        email: email ?? this.email,
        signupId: signupId ?? this.signupId,
        signupToken: signupToken ?? this.signupToken,
        password: password ?? this.password,
        firstName: firstName ?? this.firstName,
        lastName: lastName ?? this.lastName,
        role: role ?? this.role,
        jobTitle: jobTitle ?? this.jobTitle,
      );
}

class SignupFlowNotifier extends Notifier<SignupFlowState> {
  @override
  SignupFlowState build() => const SignupFlowState();

  void setStart(String phone, String email, String signupId) {
    state = state.copyWith(phone: phone, email: email, signupId: signupId);
  }

  void setSignupToken(String token) => state = state.copyWith(signupToken: token);
  void setPassword(String pwd) => state = state.copyWith(password: pwd);
  void setProfileFields({
    required String firstName,
    required String lastName,
    required String role,
    required String jobTitle,
  }) {
    state = state.copyWith(
      firstName: firstName,
      lastName: lastName,
      role: role,
      jobTitle: jobTitle,
    );
  }

  void reset() => state = const SignupFlowState();
}

final signupFlowProvider =
    NotifierProvider<SignupFlowNotifier, SignupFlowState>(
  SignupFlowNotifier.new,
);