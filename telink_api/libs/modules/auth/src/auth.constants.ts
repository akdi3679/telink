export const ROLES = [
  'student',
  'employer',
  'organization',
  'entrepreneur',
  'company',
  'freelancer',
  'personal_use',
  'investor',
] as const;

export type Role = (typeof ROLES)[number];

export const SIGNUP_CODE_TTL_MS = 10 * 60 * 1000;
export const SIGNUP_TOKEN_TTL_S = 10 * 60;
export const SIGNUP_MAX_ATTEMPTS = 5;
export const SIGNUP_RATE_LIMIT_PER_EMAIL = 3;
export const SIGNUP_RATE_WINDOW_MS = 15 * 60 * 1000;

/** Impossible-travel detection. */
export const IMPOSSIBLE_TRAVEL_KMH = 900;
export const IMPOSSIBLE_TRAVEL_MIN_KM = 500;

/** Account lockout after repeated failed logins. */
export const LOCKOUT_MAX_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_SEC = 15 * 60;
export const LOCKOUT_DURATION_SEC = Number(
  process.env.LOCKOUT_DURATION_SEC ?? 15 * 60,
);
/** Passkey (WebAuthn) ceremony constants. */
export const PASSKEY_CHALLENGE_TTL_SEC = 5 * 60;
/** Account recovery codes. */
export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 12;
export const RECOVERY_RESET_TOKEN_TTL_S = 10 * 60;
export const RECOVERY_ATTEMPT_WINDOW_SEC = 60 * 60;
export const RECOVERY_MAX_ATTEMPTS = 5;
/** Crockford-style alphabet. No 0/O/1/I/L to avoid transcription errors. */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Step-up verification. */
export const STEPUP_ELEVATED_TTL_SEC = 30 * 60;     // 15 minutes
export const STEPUP_QUESTION_COUNT = 3;             // must enroll exactly this many
export const STEPUP_REQUIRED_ANSWERS = 2;           // must answer this many to pass
export const STEPUP_ANSWER_MIN_LENGTH = 2;
export const STEPUP_ANSWER_MAX_LENGTH = 200;
export const STEPUP_MAX_ATTEMPTS_PER_HOUR = 5;