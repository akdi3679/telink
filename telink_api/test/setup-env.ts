/**
 * E2E test environment defaults.
 *
 * Runs before any test file loads, before NestJS ConfigModule reads .env.
 * dotenv does not override existing process.env keys, so anything set here
 * wins over .env values.
 *
 * Why: tests create their own tokens in beforeAll and reuse them across
 * a suite that may run for several minutes. Production token lifetimes are
 * short (15 min). A 60s test lifetime is too short. We force 1h here.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.LOG_LEVEL = 'warn';

// DPoP enforcement off during tests. Tests that want to exercise the
// enforcement path flip it in-memory per test (see test/dpop.e2e-spec.ts).
process.env.DPOP_ENFORCED = 'false';

// Step-up enforcement off during tests by default. Tests that want to
// exercise the enforcement path flip it in-memory per test.
process.env.STEPUP_ENFORCED = 'false';
