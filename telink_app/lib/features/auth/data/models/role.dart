class RoleOption {
  final String value;
  final String label;
  const RoleOption(this.value, this.label);
}

const kRoles = <RoleOption>[
  RoleOption('student', 'Student'),
  RoleOption('employer', 'Employer'),
  RoleOption('organization', 'Organization'),
  RoleOption('entrepreneur', 'Entrepreneur'),
  RoleOption('company', 'Company'),
  RoleOption('freelancer', 'Freelancer'),
  RoleOption('personal_use', 'Personal use'),
  RoleOption('investor', 'Investor'),
];