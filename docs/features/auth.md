# Auth (Signup + Login)

> Signup with phone + email + password. Login with email-or-phone + password.
> Custom JWT with rotating refresh tokens. Being reworked to OIDC + BFF (see section 11 Changelog).
**Owner:** `telink_api/libs/modules/auth`
**Depends on:** Prisma, Redis, EmailModule, OidcModule
**Depended on by:** every protected endpoint in the API

---

## 1. Overview

Users create an account with a phone number, an email, and a password. The email
is verified with a 6-digit code. After signup, users log in with either their
email or their phone, plus their password. Sessions are tracked server-side with
refresh tokens.

No social login. No passkeys yet (planned). No SMS. Email is the only
verification channel in v1.

## 2. Architecture

```
Mobile/Web client
|
| HTTPS POST /auth/signup/start (phone, email)
| HTTPS POST /auth/signup/verify-email (signupId, code)
| HTTPS POST /auth/signup/complete (signupToken, password, profile)
| HTTPS POST /auth/login (identifier, password)
| HTTPS GET /auth/me (Bearer token)
|
v
NestJS AuthModule
|
+-- AuthService (business logic)
+-- AuthController (HTTP routes)
+-- JwtAuthGuard (protects routes)
+-- CurrentUser (parameter decorator)
|
+-- Prisma -> auth.users, profiles, pending_signups, sessions
+-- Redis -> (future: rate limit, token families)
+-- Email -> verification codes (console in dev, SMTP in prod)
```

## 3. Data model

```prisma
model User {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  phone         String   @unique
  email         String   @unique
  emailVerified Boolean  @default(false) @map("email_verified")
  passwordHash  String   @map("password_hash")
  status        String   @default("active")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  profile       Profile?
  sessions      Session[]
  @@map("users")
}

model PendingSignup {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  phone      String
  email      String
  codeHash   String    @map("code_hash")
  attempts   Int       @default(0)
  expiresAt  DateTime  @map("expires_at")
  verifiedAt DateTime? @map("verified_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  @@index([phone])
  @@index([email])
  @@index([expiresAt])
  @@map("pending_signups")
}

model Session {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId           String    @map("user_id") @db.Uuid
  refreshTokenHash String    @map("refresh_token_hash")
  deviceId         String?   @map("device_id")
  ip               String?
  userAgent        String?   @map("user_agent")
  expiresAt        DateTime  @map("expires_at")
  revokedAt        DateTime? @map("revoked_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([refreshTokenHash])
  @@map("sessions")
}
```

## 4. API

**POST /auth/signup/start**

Request a verification code for a new signup.

Body: `{ "phone": "+21612345678", "email": "user@example.com" }`

Returns 201 `{ "signupId": "uuid" }`.

Errors: 409 if phone or email already registered. 429 if rate limited.

**POST /auth/signup/verify-email**

Verify the code sent to email.

Body: `{ "signupId": "uuid", "code": "123456" }`

Returns 201 `{ "signupToken": "jwt" }` - short-lived JWT (10 min) with scope=signup.

Errors: 401 invalid code. 400 expired or not verified.

**POST /auth/signup/complete**

Create the account.

Body:
```json
{
  "signupToken": "jwt",
  "password": "Password1",
  "firstName": "Seif",
  "lastName": "Doe",
  "role": "student",
  "jobTitle": "Engineer"
}
```

Returns 201 `{ accessToken, refreshToken, user, profile }`.

Errors: 401 bad signupToken. 409 account exists.

**POST /auth/login**

Log in with email or phone.

Body: `{ "identifier": "user@example.com", "password": "Password1" }`

Returns 200 `{ accessToken, refreshToken, user, profile }`.

Errors: 401 invalid credentials. 403 account not active.

**GET /auth/me**

Current user + profile.

Header: `Authorization: Bearer <accessToken>`

Returns 200 `{ user, profile }`.

Errors: 401 missing/invalid/expired token.

## 5. Security

- Password hashing: Argon2id via @node-rs/argon2 (default parameters, cost 12+)
- Access token: JWT, HS256, 15 min expiry
- Refresh token: JWT, HS256, 30 day expiry, stored as SHA-256 hash in DB
- Email code: 6 digits, HMAC-SHA256 hashed, 10 min TTL, max 5 attempts
- Signup token: short-lived (10 min) JWT with scope: "signup" - only accepted by /auth/signup/complete
- Rate limit: signup start is capped at 3 per email per 15 min
- Audit: (planned) every login, logout, failed attempt logged
- PII: emails are lowercased, phones are E.164-normalized

Known gaps (being fixed in Phase 1.5):

- No refresh token rotation
- No replay detection
- No device binding
- No account lockout on repeated failures
- No 2FA

## 6. Configuration

| Env var | Purpose | Default |
|---|---|---|
| JWT_SECRET | HMAC key for JWTs and OTP hashes | (required) |
| JWT_EXPIRES_IN | Access token lifetime | 15m |
| JWT_REFRESH_EXPIRES_IN | Refresh token lifetime | 30d |
| EMAIL_SENDER | DI token for the email provider | console in dev |

## 7. Testing

Unit tests: `libs/modules/auth/src/auth.service.spec.ts` - 10 tests

E2E tests: `test/auth.e2e-spec.ts` - 10 tests

```
pnpm test          # unit
pnpm test:e2e      # end-to-end (needs DB up)
```

## 8. How to modify

**Add a new field to signup**

1. Add to `PendingSignup` and `User`/`Profile` in `schema.prisma`
2. `pnpm prisma migrate dev --name add_<field>`
3. Add to the DTO in `dto/signup-complete.dto.ts`
4. Pass it through in `AuthService.signupComplete`
5. Update tests

**Change password rules**

1. Edit the regex in `dto/signup-complete.dto.ts`
2. Update the same rule on the mobile side in `signup_password_page.dart`
3. Update tests

**Add a new auth method (e.g. passkey)**

1. New table `Credential` in `schema.prisma`
2. New service `PasskeyService`
3. New controller `PasskeyController`
4. Wire into `AuthModule`
5. Update the mobile login screen

## 9. Related modules

OidcModule (libs/modules/oidc) - the OIDC provider. See section 10.

### 9.1 Token Rotation and Replay Detection (Phase 1.5c)

> Implemented 2026-10-05. RFC 9700 compliant.

#### What it does

Every refresh token is used exactly once. When a client calls
`POST /auth/refresh`, the server:

1. Atomically marks the presented token as used
2. If it succeeds, issues a new access token and a new refresh token
3. If the token was already used (a replay), revokes the entire session
   and returns 401

#### Why

RFC 9700 (OAuth 2.0 Security Best Current Practice) mandates refresh token
rotation with replay detection. Without it, a stolen refresh token gives
the attacker indefinite access. With it, the theft is detected the first
time either party tries to reuse the token.

#### The atomic compare-and-set

The critical bit is one SQL statement inside `TokenService.rotate`:

```sql
UPDATE refresh_tokens rt
SET used_at = now()
FROM sessions s
WHERE rt.session_id = s.id
  AND rt.token_hash = $1
  AND rt.used_at IS NULL
  AND rt.expires_at > now()
  AND s.revoked_at IS NULL
RETURNING rt.id, rt.session_id, s.user_id
```

If this returns 1 row, we won the race - proceed. If 0, the token was
already used -> replay. Doing this in a single atomic statement (instead
of a check-then-update) eliminates the concurrency race that lets two
requests both think they have a fresh token.

#### Storage

- Client stores the refresh token in `flutter_secure_storage`
- Server stores only the SHA-256 hash in `refresh_tokens.token_hash`
- Plaintext tokens are never logged or persisted

#### Detection -> response

When a replay is detected:

- The session is marked `revoked_at = now()`, `revoked_reason = 'replay_detected'`
- All unused tokens in that session are marked used
- A `security_events` row is written: `auth.token.replay_detected`
- The API returns 401 UNAUTHORIZED with message `Session revoked: refresh token replay detected`
- The API logger emits `ERROR REPLAY: session <uuid> revoked`

#### Tables

- `refresh_tokens` - one row per issued refresh token, linked to a session
- `sessions.revoked_at` / `sessions.revoked_reason` - set when a session is killed

#### Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | /auth/refresh | Rotate a refresh token |

Body: `{ "refreshToken": "..." }`

Success: 200 `{ accessToken, refreshToken, user, profile }`

Failure: 401 with code UNAUTHORIZED and message explaining the reason

#### How to modify

- Change refresh token TTL: edit `REFRESH_TTL_SECONDS` in `libs/core/src/security/token.service.ts`
- Change grace window (currently none - zero tolerance): modify the SQL in `rotate()` to allow the previous token within N seconds
- Add a security event action: call `this.audit()` in `token.service.ts` from a new location

### 9.2 Audit Log and Roles (Phase 1.5d1)

> Implemented 2026-10-05.

#### What it does

- Every sensitive auth event is stored in `security_events` with an HMAC-SHA256 signature
- An `/admin/security-events` endpoint lets staff read and filter the log
- A `verify` endpoint recomputes the HMAC to prove an event hasn't been tampered with
- Users have a `role` field: `user` (default), `support`, `moderator`, `admin`, `super_admin`
- `RolesGuard` restricts admin endpoints to the right roles

#### Roles

| Role | Purpose |
|---|---|
| `user` | Normal user (default) |
| `support` | Can read security events, help with tickets |
| `moderator` | Can read events, remove reported content (later) |
| `admin` | Full admin, except changing other admins' roles |
| `super_admin` | Everything, including promoting/demoting admins |

The guard treats `super_admin` as a wildcard - always allowed.

#### Event actions written so far

- `auth.token.rotated`
- `auth.token.replay_detected`
- `auth.token.invalid_presented`

Future actions (1.5d2+):

- `auth.login.succeeded`, `auth.login.failed`, `auth.login.new_device`
- `auth.login.impossible_travel`
- `auth.session.revoked`
- `user.profile.updated`, `user.email.changed`, `user.phone.changed`

#### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/admin/security-events` | support+ | List with filters |
| GET | `/admin/security-events/:id/verify` | admin+ | Verify HMAC signature |

Query params for list: `userId`, `action`, `from`, `to`, `limit` (max 200), `cursor`.

Response:
```json
{
  "items": [ { "id": "", "userId": "", "action": "", "ip": "", "userAgent": "", "details": {}, "signature": "", "createdAt": "" } ],
  "nextCursor": "opaque-id-or-null",
  "hasMore": true
}
```

#### Signature scheme

Each event's HMAC is computed over:

```
userId | sessionId | action | deviceId | ip | userAgent | details(JSON) | createdAt(ISO)
```

with `JWT_SECRET` as the key. `verifySignature()` recomputes and compares. Tampering with any field (except `id` and `signature`) invalidates the signature.

#### Where it lives

```
libs/core/src/security/
  roles.decorator.ts           - @Roles(...)
  roles.guard.ts               - enforces @Roles
  jwt-auth.guard.ts            - verifies Bearer JWT
  current-user.decorator.ts    - @CurrentUser()
  security-event.service.ts    - read + verify
  admin-security-events.controller.ts
```

#### How to promote a user to admin

```sql
UPDATE users SET role = 'super_admin' WHERE email = 'your-admin@example.com';
```

After promoting, the user must log in again (or refresh) to receive a new JWT containing the updated role.

#### How to add a new event action

In `token.service.ts`, call the private `audit()` method:

```ts
await this.audit({
  userId,
  sessionId,
  action: 'auth.login.new_device',
  deviceId, ip, userAgent,
  details: { previousDeviceCount: 3 },
});
```

It will compute the signature and write the row. Nothing else to do.

### 9.3 Session Management (Phase 1.5d2a)

> Implemented 2026-10-05.

#### What it does

Lets a user see and control all their active sessions. This is the backend
for the "Where you're logged in" screen in the mobile app (Phase 1.5d2c).

#### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/sessions` | List active sessions |
| DELETE | `/auth/sessions/:id` | Revoke one session (must be yours) |
| DELETE | `/auth/sessions` | Revoke all others except the current |

#### The `sessionId` JWT claim

Every access token now carries a `sessionId` claim. This lets the server
know which session is making a request, so we can:

- Mark the current session with `isCurrent: true` in the list
- Skip the current session when revoking all others

#### List response shape

```json
[
  {
    "id": "uuid",
    "deviceId": "string-or-null",
    "ip": "203.0.113.42",
    "userAgent": "Mozilla/5.0...",
    "geoCity": "Tunis",
    "geoCountry": "TN",
    "createdAt": "2026-10-05T19:37:29.892Z",
    "lastSeenAt": "2026-10-05T19:37:29.892Z",
    "isCurrent": true
  }
]
```

`deviceId` and geo fields are currently null for PowerShell test clients.
They populate once the mobile app sends them (Phase 1.5d3).

#### Revoke reasons recorded

- `user_requested` - user revoked a single session manually
- `user_requested_all_others` - user signed out other devices
- `replay_detected` - refresh token replay triggered auto-revoke
- `admin_revoked` - (future) admin forced logout

Each revocation writes a `security_events` row with action
`auth.session.revoked` and the reason in `details.reason`.

#### How to modify

- Change session TTL: edit `REFRESH_TTL_SECONDS` in `token.service.ts` - it determines session expiry too
- Add a revoke reason: call `TokenService.revokeForUser(userId, sessionId, 'your_reason')`
- Auto-revoke old sessions on new login: in `AuthService.login`, call `TokenService.revokeAllExcept` before issuing tokens

## 9.4 Login Alerts (Phase 1.5d2b)

> Implemented 2026-10-05.

### What it does

Every login is recorded. When a user logs in from a new User-Agent we've
never seen for them, we send an email alert with the time, device, IP,
and location.

### Events written on every login attempt

| Event | When |
|---|---|
| `auth.login.succeeded` | Password matched, account active |
| `auth.login.failed` | Password wrong, or account not active |
| `auth.login.new_device` | First time this UA logs in for this user |

### New-device detection (v1)

User-Agent string. If no prior `Session` for the user has the same
User-Agent, we consider it a new device. This is a proxy until we have
real device fingerprints (Phase 1.5d3).

### The alert email

Plain-text email sent via the existing `EmailSender`. Contains:

- Timestamp (UTC)
- User-Agent (device/browser)
- IP address
- Location (if known from geo)

Sent asynchronously so it never blocks the login response. Failures are
logged but do not fail the login.

### Response shape

`POST /auth/login` now returns an extra field:


{ "isNewDevice": true }

The mobile app can use this to show a one-time banner: "New sign-in from
this device" or to prompt for 2FA in future phases.

How to modify
Change alert threshold: edit the previousFromSameUa logic in AuthService.login

Change email copy: edit sendNewDeviceAlert in auth.service.ts

Disable alerts temporarily: comment out the if (isNewDevice) block

Add a second channel (SMS, push): send from within sendNewDeviceAlert


## 9.5 IP-Based Geolocation (Session 2)

> Implemented 2026-10-07.

### What it does

Every login resolves the client's real location from their IP address,
using a self-hosted MaxMind-format database. Client-supplied
x-geo-lat / x-geo-lng headers are now IGNORED.

### Why

Before this, impossible-travel detection relied on the client telling
the server where it was. A malicious client could lie. Now the server
looks up the location itself from the connection IP.

### Data source

DB-IP Lite (free, no account, monthly updates):
    https://db-ip.com/db/download/ip-to-city-lite

Downloaded once to:
    telink_api/data/dbip-city-lite.mmdb

Path configured via:
    GEOIP_DB_PATH=./data/dbip-city-lite.mmdb

The file is MaxMind DB format and works with the `maxmind` npm package
(v4.x, CommonJS).

### Component

    libs/core/src/geo/geo.service.ts

    lookup(ip: string | null): GeoLocation

    GeoLocation = { city, country, countryCode, lat, lng }
    Returns nulls for private/loopback IPs or missing database.

    Private IP detection:
        127.0.0.0/8, ::1, 10.0.0.0/8, 172.16.0.0/12,
        192.168.0.0/16, 169.254.0.0/16, fe80::/10, fc00::/7

### Login flow

    1. Request arrives -> @Ip() decorator gives the client IP
    2. In test mode, x-test-ip header overrides (never in production)
    3. GeoService.lookup(ip) returns { city, country, lat, lng }
    4. Session row gets geoCity, geoCountry, geoLat, geoLng, geoSource='ip'
    5. Impossible-travel detection uses these coordinates

### Limitations

    - VPN users appear at the VPN's exit location. Correct behavior.
    - Mobile carriers may route through a hub city, not the user's exact
      location. Better than nothing.
    - DB-IP Lite coverage is good but not exhaustive. Some IPs return
      nulls. In that case we simply skip impossible-travel for that login.
    - The mmdb file is ~90MB. Updated monthly. Should be refreshed by a
      cron job (Phase 16).

### How to modify

- Update the database: redownload dbip-city-lite.mmdb, restart the API.
  The GeoService reloads on boot.
- Change lookup source: swap the `maxmind` package for any MaxMind-DB
  reader. The interface is the same.
- Add country-only fallback: return country without city when the city
  is missing in the DB.
## 9.5 Device Identity (Phase 1.5d3)

> Implemented 2026-10-05.

### What it does

Clients send a stable identifier as the `x-device-id` header on login and
refresh. The server prefers it over User-Agent for new-device detection.
A generated device id is harder to spoof accidentally than a UA string,
because it is unique per app install, not per browser build.

### Client contract (mobile)

The mobile app generates a device id once on first launch and stores it
in flutter_secure_storage. Recommended formula:

  SHA-256( installID + "|" + os + "|" + model + "|" + "telink-v1" ).substring(0, 32)

Guidelines:

- Generate on first app launch
- Store in secure storage
- Never regenerate until the app is reinstalled
- Do NOT include advertising IDs, IMEI, MAC, or any hardware identifier
- Send as x-device-id header on POST /auth/login and POST /auth/refresh

### Server behavior

On login:

- If x-device-id is present: isNewDevice = (no prior session for this user has that deviceId)
- Else if User-Agent is present: isNewDevice = (no prior session for this user has that User-Agent)
- Else: isNewDevice = false

The normalized device id is stored on Session.deviceId and appears in
every security_events row written during that session.

### Validation

normalizeDeviceId in auth.service.ts:

- Trims whitespace
- Rejects empty strings
- Rejects values longer than 128 characters
- Rejects values containing control characters (\\x00-\\x1f, \\x7f)
- Returns null on any rejection (falls back to User-Agent path)

### Detection method recorded

Every auth.login.new_device event includes details.detectionMethod:

- "device_id" - new-device decision made using x-device-id
- "user_agent" - decision made using User-Agent (fallback)
- "none" - neither was present (very rare)

This lets you audit why a login was flagged as new.

### Limitations

- Not hardware-bound. A determined attacker can spoof it.
- Web clients may send a browser fingerprint, weaker than mobile.
- Phase 1.5e may add hardware attestation (Play Integrity, App Attest).

### How to modify

- Change validation: edit normalizeDeviceId in auth.service.ts
- Change client generation: mobile code in telink_app (later phase)
- Add hardware attestation: new column on Session plus verification in login
## 9.6 Impossible Travel Detection (Phase 1.5d4)

> Implemented 2026-10-06.

### What it does

Every login may include coordinates via x-geo-lat / x-geo-lng headers.
The server compares the new coordinates with the user's last known
location. If the implied travel speed exceeds 900 km/h (commercial jet),
the login is flagged and the user gets an alert email.

### How coordinates arrive

The client sends them as headers on POST /auth/login:

    x-geo-lat: 36.8065
    x-geo-lng: 10.1815
    x-geo-city: Tunis
    x-geo-country: TN

The mobile app will populate these from GPS in a later phase. For now,
tests and tools can send them manually.

### Algorithm

1. On login, look up the user's most recent non-revoked session that
   has non-null geoLat and geoLng.
2. Compute haversine distance between previous and current coordinates.
3. If distance < 500 km, skip (avoids noise from small GPS jitter).
4. Compute elapsed time = now - previous session's createdAt.
5. Compute implied speed = distance / elapsed_hours.
6. If speed > 900 km/h, flag.

### Constants

Defined in libs/modules/auth/src/auth.constants.ts:

    IMPOSSIBLE_TRAVEL_KMH = 900
    IMPOSSIBLE_TRAVEL_MIN_KM = 500

### What happens on flag

1. A security_events row is written: auth.login.impossible_travel
2. details contains: previousCity, previousCountry, previousAt,
   currentCity, currentCountry, distanceKm, elapsedSeconds, speedKmh
3. The API logs a WARN: IMPOSSIBLE TRAVEL for <user>: <A> -> <B> (...)
4. The user gets an email: "Unusual sign-in activity on your Telink account"
5. Login still succeeds. We do not block; we inform.

### Why not block

Meta, Google, and most banks alert rather than block on first detection.
Blocking causes false positives (VPNs, flights, mobile IP switching) and
locks out legitimate users. We escalate if the same user has repeated
events, but the immediate response is notification.

### Limitations

- Depends on client-supplied coordinates. A malicious client could lie.
  Real IP-based geocoding is a future phase.
- Requires the previous login to have coordinates. First login never
  triggers.
- Thresholds are global. Per-country tuning is possible but not needed yet.

### How to modify

- Change threshold: edit IMPOSSIBLE_TRAVEL_KMH in auth.constants.ts
- Change minimum distance: edit IMPOSSIBLE_TRAVEL_MIN_KM
- Add blocking: throw in detectImpossibleTravel before sending the alert
- Add IP-based geocoding: replace ctx.geoLat/ctx.geoLng with an IP lookup

## 9.7 Account Lockout (Phase 1.5d5)

> Implemented 2026-10-06.

### What it does

After 5 failed logins within a 15-minute window, the account is locked
for 15 minutes. During the lock, even correct passwords are rejected
with code ACCOUNT_LOCKED. A successful login resets the counters.

### Storage

Redis. Keys:

    lockout:failed:<identifier>   counter, TTL 15 min
    lockout:locked:<identifier>   flag, TTL 15 min

`<identifier>` is the trimmed login identifier (email or phone). Emails
are lowercased by the caller before reaching this service.

### Endpoint behavior

POST /auth/login:

- Locked account -> 429 with code ACCOUNT_LOCKED and details.retryAfterSec
- Wrong password on unlocked -> 401, counter incremented
- 5th wrong password -> 429 with code ACCOUNT_LOCKED
- Correct password on unlocked -> 200, counters cleared

### Config

auth.constants.ts:

    LOCKOUT_MAX_ATTEMPTS = 5
    LOCKOUT_WINDOW_SEC = 15 * 60
    LOCKOUT_DURATION_SEC -> read at call time from process.env,
                            falls back to 15 * 60

Reading LOCKOUT_DURATION_SEC at call time (not module load) lets tests
override it via env without restarting the process.

### Fails open on Redis errors

If Redis is unreachable:

- isLocked returns { locked: false }
- recordFailure returns { locked: false, attempts: 0 }
- recordSuccess is a no-op

This is deliberate. A Redis outage must never block legitimate logins.
We log a warning, temporarily lose lockout enforcement, and keep the
app running.

### Constants vs env vars

LOCKOUT_MAX_ATTEMPTS and LOCKOUT_WINDOW_SEC are true constants — read
at module load, no env override.

LOCKOUT_DURATION_SEC is environment-dependent — read at call time so
tests can shorten it.

### How to modify

- Change the threshold: edit LOCKOUT_MAX_ATTEMPTS in auth.constants.ts
- Change the lock duration: change LOCKOUT_DURATION_SEC fallback or set
  env var LOCKOUT_DURATION_SEC
- Add lockout to signup or other endpoints: inject LockoutService and
  call isLocked/recordFailure/recordSuccess around the action
- Add a security_events row on lock: currently we log a warning, we do
  not write an event. Add one if you want the audit trail to include it.


## 9.8 Mobile Hardening (Phase 1.5e)

> Implemented 2026-10-06.

### What it does

Client-side protections that require mobile code (some activate only on
Android or iOS builds). Together with the server-side phases 1.5a-1.5d5,
this brings us to MASVS L2 compliance.

### Features

1. Clipboard auto-clear (all platforms)
   - After copying a sensitive string, the clipboard is cleared after 60s.
   - Only clears if the user has not copied something else in the meantime.

2. In-memory wipe on long background (all platforms)
   - When the app is backgrounded for more than 60 seconds, we fire an
     in-app event to wipe in-memory state.
   - The tokens remain in secure storage; only in-RAM copies are discarded.

3. Secure storage audit (all platforms)
   - On boot, verifies flutter_secure_storage is functional by writing,
     reading, and deleting a probe key.
   - If the probe fails, we log a warning. Tokens will not be stored.

4. Certificate pinning (mobile only, config ready)
   - CertPinning.build() returns an interceptor when the app runs on
     Android or iOS in release mode with pins configured.
   - On web or in debug, it returns null. The browser handles TLS.
   - To add pins: see lib/core/security/cert_pinning.dart.

5. Jailbreak / root detection (mobile only)
   - Uses flutter_jailbreak_detection.
   - Returns a boolean. We do NOT block the app. The signal is available
     for sensitive screens to make their own decisions.

6. Screen capture prevention (Android only)
   - Uses flutter_windowmanager FLAG_SECURE.
   - Blocks screenshots and screen recording. iOS not implemented.

7. Anti-debug signal (mobile only)
   - Detects Dart VM service port in release builds.
   - Speed bump only. Full anti-debug requires native code.

### Where it lives

    telink_app/lib/core/security/
      clipboard_service.dart
      lifecycle_service.dart
      secure_storage_audit.dart
      cert_pinning.dart
      device_integrity.dart
      screen_security.dart
      anti_debug.dart

### Wired into

- lib/main.dart         -> SecureStorageAudit.isAvailable() on boot
- lib/app.dart          -> LifecycleService wraps the app
- lib/core/network/dio_client.dart -> CertPinning.build()

### How to modify

- Add certificate pins: edit the allowedSha256 list in cert_pinning.dart
- Change the background wipe threshold: edit _wipeAfter in lifecycle_service.dart
- Change the clipboard TTL: edit _clearAfter in clipboard_service.dart
- Enable screen capture prevention on a specific screen: call
  ScreenSecurity.enable() in initState and disable() in dispose

### Notes

- On Flutter Web, mobile-only packages are no-ops. The app still works.
- On Android release builds, all 7 features activate.
- On iOS release builds, 6 of 7 activate (screen capture is Android-only).

## 9.9 Passkeys (WebAuthn) - Backend (Phase 1.5f1)

> Implemented 2026-10-06. Backend only.

### What it does

Full WebAuthn/FIDO2 backend for passkey registration and login. Clients
(web or mobile) call these endpoints, and the server verifies the
cryptographic ceremony. Passwords remain available as a fallback.

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /auth/passkey/register/begin | yes | Get challenge + options to create a passkey |
| POST | /auth/passkey/register/finish | yes | Verify attestation, save public key |
| POST | /auth/passkey/login/begin | no | Get challenge to sign in |
| POST | /auth/passkey/login/finish | no | Verify assertion, issue tokens |
| GET | /auth/passkey | yes | List my passkeys |
| DELETE | /auth/passkey/:id | yes | Remove one |

### Data model

model PasskeyCredential:

- id: uuid
- userId: uuid (FK to User)
- credentialId: unique string (base64url from authenticator)
- publicKey: Bytes (raw public key)
- counter: BigInt (WebAuthn signature counter)
- transports: String[] (usb, nfc, ble, internal, hybrid)
- name: string | null (user-supplied label, e.g. "My iPhone")
- aaguid: string | null (authenticator model identifier)
- createdAt: DateTime
- lastUsedAt: DateTime | null

### Challenge storage

Challenges are stored in Redis, not Postgres:

- passkey:register:<userId> -> challenge, TTL 5 min
- passkey:register:name:<userId> -> device name, TTL 5 min
- passkey:auth:<sessionId> -> challenge JSON, TTL 5 min

sessionId is a random 24-byte base64url string, returned to the client.
After a successful ceremony, the challenge is deleted (single-use).

### Configuration

| Env var | Purpose | Dev default |
|---|---|---|
| WEBAUTHN_RP_ID | Relying Party ID (must match origin hostname) | localhost |
| WEBAUTHN_RP_NAME | Display name shown in the biometric prompt | Telink |
| WEBAUTHN_ORIGIN | Allowed origin (must match browser URL) | http://localhost:8080 |

For localhost development, RP_ID must be exactly "localhost" (not 127.0.0.1)
and ORIGIN must be exactly "http://localhost:8080". Any mismatch and
WebAuthn fails with a security error.

### Security properties

- Private key never leaves the user's device.
- Public key stored on server; cannot be used to authenticate.
- Signature counter prevents cloned authenticator replay.
- Challenge is single-use and expires in 5 minutes.
- RP ID binding prevents phishing (the credential only works on telink's domain).
- User verification (biometric or PIN) required by the OS at signing time.

### Dependencies

- @simplewebauthn/server@11 - ceremony verification
- @simplewebauthn/types@11 - TypeScript type definitions

Note: in v11, types live in @simplewebauthn/types. In v13+, they moved
into the server package. If you upgrade to v13, change the imports.

### How to modify

- Change challenge TTL: edit PASSKEY_CHALLENGE_TTL_SEC in auth.constants.ts
- Change user verification policy: edit userVerification in beginRegistration
- Change attestation: edit attestationType (currently "none" for privacy)
- Add passkey-only accounts (no password): relax the /auth/login path

### WebAuthn viability check (Phase 1.5f2a)

A diagnostic page at /debug/webauthn confirms the browser exposes
WebAuthn. Result on SRWare Iron (Chromium fork), Windows 10:

    Secure context (HTTPS or localhost)     -> ✅
    PublicKeyCredential API                 -> ✅
    navigator.credentials API               -> ✅
    Device has platform authenticator       -> ❌

Verdict: the browser supports WebAuthn. The dev machine has no
platform authenticator configured (Windows Hello not set up, no
biometric hardware). This is expected on a development PC.

Passkey UI is deferred to the mobile build (Phase 1.5f2b) where the
native `passkeys` plugin provides cleaner integration and full
biometric support. The backend (1.5f1) remains complete and tested.


### Client UI (Phase 1.5f2b)

Web UI for passkey registration now works end-to-end.

Location:
    telink_app/lib/features/profile/presentation/pages/passkeys_page.dart

Flow:
    1. User opens Profile -> Security -> Passkeys
    2. Taps "Add passkey" FAB
    3. Names the passkey (e.g. "My laptop")
    4. Browser calls navigator.credentials.create()
    5. User confirms via biometric / PIN / security key
    6. Server verifies and stores public key

Delete flow:
    Tap the trash icon -> confirm dialog -> DELETE /auth/passkey/:id

User verification is optional on the server (requireUserVerification: false)
because the virtual authenticator used in dev does not support it. Real
devices still do biometric verification at the OS level.

### JS interop details

The WebAuthn client lives in:

    lib/core/security/webauthn_client_web.dart    (web)
    lib/core/security/webauthn_client_stub.dart   (non-web)

Conditional export picks the right one at compile time. On non-web it
throws UnsupportedError so mobile builds do not try to use it.

Registration uses:
    PublicKeyCredential.parseCreationOptionsFromJSON()
    navigator.credentials.create()
    credential.toJSON()

Available in SRWare Iron 133 and all modern Chromium browsers.

### Sign-in UI (Phase 1.5f2c)

Sign in with a passkey works end-to-end on the web build.

Location:
    telink_app/lib/features/auth/presentation/pages/login_page.dart

The login screen now has two buttons:
    [ Sign in ]                -> email + password
    [ Sign in with a passkey ] -> WebAuthn ceremony

Passkey sign-in flow:
    1. User taps "Sign in with a passkey"
    2. If the email field is empty, the browser shows a picker of all
       passkeys for this site (discoverable credential flow).
    3. Otherwise, the browser filters to that user's passkeys.
    4. User selects a passkey, verifies with biometric or device PIN.
    5. App sends the signed assertion to /auth/passkey/login/finish.
    6. Server verifies with the stored public key and issues tokens.

The button only appears on web. Mobile passkey support is Phase 1.5f2d.

Client-side WebAuthn uses the same WebAuthnClient as registration:

    lib/core/security/webauthn_client_web.dart

Error handling maps cryptic browser errors to friendly messages:
    NotAllowedError  -> "Passkey sign-in was cancelled"
    SecurityError    -> "Passkeys are not supported on this device"
    Other            -> "Passkey sign-in failed"

### Full passkey lifecycle (Phase 1.5f1 - 1.5f2c)

    Register -> List -> Sign in -> Delete

All four flows are implemented and tested. A user can create an account,
add a passkey, sign out, and sign back in without typing a password.

### Signing key encryption at rest (Session 1)

Implemented 2026-10-07.

Private JWKs are encrypted before being written to Postgres. Uses
AES-256-GCM with a 32-byte master key from the SIGNING_KEY_MASTER
environment variable.

Storage format:
    { "enc": "base64( iv(12) || ciphertext || tag(16) )" }

The `encrypted` boolean column marks whether the stored payload is
encrypted. Existing plaintext rows are migrated on the next boot:
SigningKeyService.ensureKeys() detects encrypted=false, encrypts the
JWK in place, and marks it encrypted.

Component:

    libs/core/src/security/crypto.service.ts
        encrypt(plaintext: string): string
        decrypt(payload: string): string

Rules:
    - Master key must be 32 bytes (base64-encoded in env)
    - IV is random per encryption (never reused)
    - GCM tag verified on decrypt (tamper detection)
    - Decrypted JWK lives only in process memory at boot

If SIGNING_KEY_MASTER is lost or rotated without re-encrypting first,
existing keys become unreadable. Back up the master key securely
(Hetzner Storage Box, offline copy). Phase 16 will add key rotation.

Verify with: `pnpm prisma studio` -> table `oidc_signing_keys` ->
column `private_jwk` should look like `{ "enc": "..." }`, not a raw JWK.

## 9.9 DPoP Device Trust (Session 3)

> Backend implemented 2026-10-07. Client implementation in Session 3b.

### What it does

DPoP (Demonstrating Proof of Possession, RFC 9449) binds every API request
to a private key that lives only on the client device. A stolen bearer
token is useless without the matching private key. PowerShell, curl, and
modified clients cannot produce valid proofs.

### How it works

1. On first login, the client generates an ECDSA P-256 keypair.
2. The private key stays on the device (IndexedDB on web, Keychain/Keystore
   on mobile). It is never transmitted.
3. The public key is sent to POST /auth/dpop/register and stored on the
   Session row (dpop_public_key_jwk).
4. Every API request includes a DPoP header: a JWT signed by the private
   key, containing:
     - htm: HTTP method (GET, POST, ...)
     - htu: HTTP path (/auth/me)
     - iat: issued-at timestamp
     - jti: unique ID for replay prevention
     - ath: SHA-256 hash of the bearer access token
5. JwtAuthGuard verifies the proof on every request (when DPOP_ENFORCED=true).

### Verification (DpopService.verify)

    - Header typ must be "dpop+jwt"
    - Header alg must be "ES256"
    - Header jwk must be an EC P-256 public key (private "d" part rejected)
    - Signature verified with jose.jwtVerify
    - Token age <= 60s
    - payload.htm === request.method
    - payload.htu path === request path
    - payload.ath === sha256(access_token) base64url
    - payload.jti is unseen (Redis SET NX with 120s TTL)
    - payload JWK matches the session's registered key

### Configuration

    DPOP_ENFORCED=false  (default)
        Proofs are verified if present. Missing proofs are allowed.
        Safe roll-out mode.

    DPOP_ENFORCED=true
        Proofs are required on all non-exempt routes. Missing or invalid
        proofs return 401.

### Exempt routes

Marked with @DpopExempt() decorator. Currently:
    POST /auth/dpop/register
    GET  /auth/dpop/status
    DELETE /auth/dpop

These must be reachable before the client can send proofs.

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /auth/dpop/register | yes | Register public key for current session |
| GET  | /auth/dpop/status   | yes | Check registration + enforcement state |
| DELETE | /auth/dpop        | yes | Unregister (forces re-registration) |

### Data model

Session gained:
    dpopPublicKeyJwk  Json?  @map("dpop_public_key_jwk")

### Files

    libs/core/src/security/dpop.service.ts        verification
    libs/core/src/security/dpop.decorator.ts      @DpopExempt()
    libs/core/src/security/jwt-auth.guard.ts      enforcement point
    libs/modules/auth/src/dpop.controller.ts      3 endpoints

### Why not full OAuth DPoP?

Full RFC 9449 makes oidc-provider issue DPoP-bound tokens directly. That
would require modifying oidc-provider, which is a large migration we are
deferring (Session 1.5b2).

We instead verify proofs at the API layer, on top of standard bearer
tokens. The security property is the same: possession of the private key
is required for every request.

### Rollout plan

    1. Deploy with DPOP_ENFORCED=false (this release)
    2. Ship client DPoP support (Session 3b)
    3. Monitor adoption: /auth/dpop/status returns registered=true
    4. Flip DPOP_ENFORCED=true when adoption is high enough
    5. Old clients that cannot register a key get 401

### How to modify

- Change proof max age: edit MAX_AGE_SEC in dpop.service.ts (default 60s)
- Change jti replay window: edit JTI_TTL_SEC (default 120s)
- Enable enforcement: DPOP_ENFORCED=true in .env
- Add an exempt route: decorate the handler with @DpopExempt()
- Add a second key algorithm: extend the alg check in DpopService

### Limitations

- Only ES256 (ECDSA P-256) supported. RSA and Ed25519 are not.
- Nonce challenge flow (server-issued nonces) is not implemented. jti
  uniqueness is the replay defense.
- Proof-of-possession applies to our API only. The OIDC endpoints still
  use standard bearer auth.




  ### Client implementation (Session 3b)

File:
    telink_app/lib/core/security/dpop_client_web.dart   (web)
    telink_app/lib/core/security/dpop_client_stub.dart  (non-web)

Key storage:
    IndexedDB, database "telink-dpop", object store "keys",
    single record keyed by "current".

Generation:
    1. crypto.subtle.generateKey(ECDSA, P-256, extractable=true)
    2. Export public JWK (persisted).
    3. Export private JWK, re-import as non-extractable
       (extractable=false, keyUsages=["sign"]).
    4. Store the non-extractable handle + public JWK in IndexedDB.

After step 3, the private key bytes cannot be read back from JS. Even if
XSS runs on the page, it can only sign with the key, not exfiltrate it.

Request signing (Dio interceptor in dio_client.dart):
    For every authenticated request except the exempt list, add:
        DPoP: <signed JWT>
    The JWT has typ=dpop+jwt, alg=ES256, jwk=<public>, and payload with
    htm, htu, iat, jti, ath.

Exempt paths (client-side):
    /auth/dpop/* (registration itself)
    /oidc/*
    /auth/signup/*
    /auth/login
    /auth/refresh

Verification status (as of 2026-10-07):
    DPOP_ENFORCED=false: browser works, curl works.
    DPOP_ENFORCED=true:  browser works, curl gets 401.

### Known gap: token refresh

Access tokens expire after 15 minutes. The Dio interceptor does NOT
automatically call /auth/refresh on 401 yet. When a token expires, the
user must log in again.

Fix (next session): add a 401 interceptor that:
    1. Detects 401 with body code UNAUTHORIZED
    2. Calls POST /auth/refresh with the stored refresh token
    3. Stores the new tokens
    4. Retries the original request once
    5. On refresh failure, clears tokens and forces re-login


    ### Auto-refresh on 401 (Session 3c)

The Dio client automatically refreshes the access token when it expires.

Flow:
    1. Request fails with 401.
    2. DioClient's onError interceptor fires.
    3. If the path is a non-auth endpoint and the request has not
       already been retried, the interceptor triggers a refresh.
    4. Concurrent 401s coalesce into a single refresh call.
    5. On success, the original request is retried once with the new
       token. Its DPoP proof is re-signed with the new ath.
    6. On refresh failure (invalid/revoked/replayed refresh token),
       tokens are cleared and the user is sent to the login screen.

Bypass list (no refresh triggered):
    /auth/login, /auth/refresh, /auth/signup/*, /auth/dpop/*, /oidc/*

Coalescing:
    DioClient keeps a `_refreshFuture` while a refresh is in-flight.
    All concurrent 401s await the same future. Verified by test:
    two parallel requests, one POST /auth/refresh, two retries.

Retry protection:
A request carries a private flag in its Dio options after the first
retry attempt (`extra['_auth_retried'] = true`). This prevents an
infinite loop if the refresh succeeds but the retried request still
returns 401 - for example, if the server-side session was revoked
between the refresh and the retry.

Token clearing rules:
Tokens are cleared from secure storage only when the API returns a
real authentication failure (HTTP 401 or 403) that the interceptor
cannot recover from.

Tokens are NOT cleared for:
  - Cancelled requests (user refreshed the tab or navigated away)
  - Connection errors (device offline)
  - Request/receive timeouts
  - Server-side errors (HTTP 5xx)
  - Any other transient failure

Rationale: a transient failure is not proof that the credentials are
invalid. Clearing on transient errors would log the user out every
time the network hiccups.

### Known behavior after this change

    - Access token TTL 15 min: silent, user never sees it expire.
    - Refresh token TTL 30 days, rotated on every use: a user who
      returns after weeks still gets a new session without re-login
      as long as the refresh token is still valid.
    - If refresh fails: the user is logged out cleanly, not silently.
## 9.10 Account Recovery (Session 4a)

> Backend implemented 2026-10-08. Mobile UI in Session 4b.

### What it does

Users generate ten one-time recovery codes. If they lose both their
password and their passkeys, they can reset the account with one code.

### How the codes work

- 10 codes, each 12 characters
- Alphabet excludes 0/O/1/I/L to avoid transcription errors
- Hashed with Argon2id before storage (like passwords)
- Each code is single-use
- Generating new codes invalidates all old ones

Codes are displayed to the user exactly once. The server never stores
the plaintext form.

### Flow

Generate (authenticated):
    POST /auth/recovery/generate
    -> { codes: ["ABCD-EFGH-JKLM", ...] }
    Also emails a copy to the user.
    Replaces any existing codes.

Status:
    GET /auth/recovery/status
    -> { total, remaining, generatedAt }

Reset (public, two steps):
    Step 1: POST /auth/recovery/verify
        Body: { email, code }
        -> { resetToken }  (valid 10 minutes)
        Rate limit: 5 attempts per hour per email
        Does NOT consume the code yet.

    Step 2: POST /auth/recovery/complete
        Body: { resetToken, newPassword }
        -> { accessToken, refreshToken, user, profile }
        Consumes the matched code.
        Revokes all existing sessions and refresh tokens.
        Signs the user in with fresh tokens.
        Sends a notification email.

### Data model

model RecoveryCode:
    id           uuid PK
    userId       uuid FK -> User, onDelete Cascade
    codeHash     string (Argon2id)
    usedAt       datetime? (set when consumed)
    usedFromIp   string?  (for forensics)
    createdAt    datetime

Index: (userId, usedAt) for fast "unused codes for user" queries.

### Rate limits

    generate:     per-user throttle via @nestjs/throttler
    verify:       5 attempts per hour per email (Redis)
    complete:     single-use resetToken, 10-minute window

The Redis counter is cleared after a successful complete so legitimate
users are not locked out.

### Security events

    auth.recovery.codes_generated
    auth.recovery.failed
    auth.recovery.completed

All appear in /admin/security-events.

### Why this matters

Without recovery, a user who forgets their password and loses their
passkey is locked out permanently. This is a support nightmare and a
churn driver. Recovery codes solve it without compromising the passkey
security model: the codes ARE the second factor the user already
possesses (physical or stored securely offline).

### Interaction with DPoP

/auth/recovery/* is exempt from DPoP enforcement because the user is
not yet authenticated with a session when they call verify / complete.
Once they complete, the fresh session gets a new DPoP key on next
client boot.

### Constants

    RECOVERY_CODE_COUNT          = 10
    RECOVERY_CODE_LENGTH         = 12
    RECOVERY_RESET_TOKEN_TTL_S   = 600  (10 minutes)
    RECOVERY_ATTEMPT_WINDOW_SEC  = 3600 (1 hour)
    RECOVERY_MAX_ATTEMPTS        = 5
    RECOVERY_ALPHABET            = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

### How to modify

- Change code length: edit RECOVERY_CODE_LENGTH (12 works well)
- Change attempts before lockout: edit RECOVERY_MAX_ATTEMPTS
- Change reset window: edit RECOVERY_RESET_TOKEN_TTL_S
- Add email delivery: already wired to the standard EmailSender
- Add SMS delivery: add an SmsService call in RecoveryService.verify

### Mobile UI (Session 4b)

Files:
    telink_app/lib/features/profile/presentation/pages/recovery_codes_page.dart
    telink_app/lib/features/auth/presentation/pages/forgot_password_page.dart

Entry points:
    Profile -> Security -> Recovery codes
    Login screen -> "Forgot password?" link

Screens:
    1. Recovery codes page
       - Shows total/remaining/generated-at
       - "Generate codes" button (or "Regenerate" if any exist)
       - Confirmation dialog before regenerating
       - On success, a modal shows the 10 codes formatted XXXX-XXXX-XXXX
       - "Copy all" copies to clipboard (auto-clear after 60s)
       - "I've saved them" closes the modal
       - Codes never shown again

    2. Forgot password page (two-step)
       - Step 1: email + recovery code -> reset token
       - Step 2: new password + confirm -> completes reset
       - On success: signs in with fresh tokens, navigates to home
       - Rate limit shown as "Too many attempts. Try again later."

    3. Logout confirmation
       - Tap logout icon -> "Sign out?" dialog
       - Cancel keeps session. Confirm signs out.

### Notes

    - The recovery codes dialog uses SelectableText so users can copy
      individual codes if needed.
    - The clipboard auto-clear logic (ClipboardService) is reused from
      Phase 1.5e.
    - Password rules on the reset screen match signup exactly.

## 9.11 Step-Up Verification (Session 5a + 5b)

> Backend: 2026-10-08. Mobile UI: 2026-10-08.

### What it does

Before certain high-risk actions, the user must prove they are the
original account owner using two independent factors:

    1. Device biometric (fingerprint, Face ID, Windows Hello)
    2. Security questions (2 of 3, chosen by the user at enrollment)

On success, the session is marked "elevated" for 5 minutes. During
that window, high-risk actions are unlocked without re-prompting.

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /auth/stepup/questions/enroll | yes | Submit 3 questions + answers |
| GET  | /auth/stepup/questions        | yes | Get questions (no answers) |
| GET  | /auth/stepup/status           | yes | Enrolled? Elevated? |
| POST | /auth/stepup/verify           | yes | Answer 2 of 3 -> elevated |
| POST | /auth/stepup/biometric        | yes | Record biometric factor |
| POST | /auth/stepup/clear            | yes | End elevated session |

### Elevated token

Stored in Redis:
    key: stepup:elevated:<sessionId>
    value: { userId, verifiedAt, factors }
    TTL: 300s

The elevated state is per-session, not per-user. Logging out, revoking
a session, or clearing manually ends the elevation.

### High-risk endpoints protected (when STEPUP_ENFORCED=true)

    POST   /auth/recovery/generate       (viewing/generating codes)
    POST   /auth/passkey/register/begin  (adding a passkey)
    POST   /auth/passkey/register/finish
    DELETE /auth/passkey/:id             (removing a passkey)
    DELETE /auth/sessions                (revoke all others)

### Data model

model SecurityQuestion:
    id            uuid PK
    userId        uuid FK -> User, onDelete Cascade
    questionKey   string  (e.g. "first_pet")
    questionText  string? (human-readable question)
    answerHash    string  (Argon2id)
    createdAt     datetime
    updatedAt     datetime

Unique: (userId, questionKey). Index: (userId).

Answers are normalized before hashing: trimmed, lowercased, whitespace
collapsed. This makes "Rex", " REX ", and "rex" all match.

### Constants

    STEPUP_ELEVATED_TTL_SEC     = 300   (5 min)
    STEPUP_QUESTION_COUNT       = 3
    STEPUP_REQUIRED_ANSWERS     = 2
    STEPUP_ANSWER_MIN_LENGTH    = 2
    STEPUP_ANSWER_MAX_LENGTH    = 200
    STEPUP_MAX_ATTEMPTS_PER_HOUR = 5

### Configuration

    STEPUP_ENFORCED=false  (default)
        Verification is verified when present, but not required.
        Safe roll-out mode.

    STEPUP_ENFORCED=true
        High-risk routes return 403 without an elevated token.

### Mobile UI

Files:
    lib/features/profile/presentation/pages/bio_verification_page.dart
    lib/features/profile/presentation/pages/security_questions_page.dart
    lib/features/profile/presentation/pages/security_overview_page.dart
    lib/features/profile/presentation/widgets/coming_soon_sheet.dart
    lib/features/profile/presentation/widgets/stepup_verify_dialog.dart
    lib/features/profile/presentation/stepup_actions.dart

Bio Verification page shows:

    Real, available now:
      - Device biometric (this browser/device)
      - Security questions (enroll + verify)

    Coming soon (mobile build):
      - Hand palmprint
      - Face liveness
      - Vein mode (experimental)
      - Iris scan

Each "coming soon" card opens a bottom sheet explaining what the
feature will do, how it will work, and which tools it will use. No
fake functionality - the user sees the honest roadmap.

Reference: MEMORY_BIOMETRICS.md at project root for full details.

### How to modify

- Change elevation TTL: edit STEPUP_ELEVATED_TTL_SEC
- Change required answers: edit STEPUP_REQUIRED_ANSWERS
- Add a high-risk endpoint: decorate with @RequireStepUp() and
  @UseGuards(JwtAuthGuard, StepUpGuard)
- Change question list: edit _availableQuestions in the mobile
  security_questions_page.dart (server stores what the client sends)
- Add a mock card: add a _MockCard with a new ComingSoonSheet


### Custom questions (Session 5b addendum)

Users can pick from the 10 built-in questions OR write their own.
Custom questions have questionKey "custom_0", "custom_1", "custom_2".
Server stores whatever the client sends.

### Change-lock (Session 5b addendum)

First-time enrollment of security questions is always allowed (no
questions exist yet).

Changing existing questions requires step-up verification first:

    POST /auth/stepup/questions/enroll
    Guard: StepUpGuard + @RequireStepUpIfEnrolled()
    Behavior: If user already has 3 questions, the guard requires an
              elevated session. Otherwise it allows.

This prevents an attacker with a stolen session from quietly changing
the questions. They would need to answer 2 of the existing 3 first.

### Client-side step-up prompts

The client calls `requireStepUp()` before issuing the API request for
any high-risk action. Flow:

    1. Client checks /auth/stepup/status (elevated?)
    2. If elevated, proceed
    3. If not, show "Confirm it is you" dialog
    4. User answers 2 of 3 questions
    5. On success, elevated for 5 min
    6. Then issue the API request

The backend also enforces step-up via StepUpGuard, so a modified
client cannot bypass the check. Defense in depth.

High-risk actions with client prompts:
    - Recovery codes: generate/regenerate
    - Passkeys: add, remove
    - Sessions: revoke all others (client prompt pending)


### Re-enrollment UX (Session 5b final)

When the user revisits Security Questions:

    - Their 3 existing questions are pre-selected
    - Answer fields are empty with placeholder
      "Leave blank to keep current answer"
    - The user can change just one field and leave the others blank
    - Server side: empty answer means "keep the existing hash
      for that questionKey"
    - If the user picks a different question, an answer is required
    - If the user clears a custom question and picks a new one,
      the new answer is required

Server behavior (POST /auth/stepup/questions/enroll):

    1. Read existing questions for the user
    2. Validate every slot (key present, unique across slots)
    3. For each slot:
        - If answer provided -> hash with Argon2, use new hash
        - If answer empty AND questionKey exists already -> keep
          old hash
        - If answer empty AND key is new -> reject with 400
    4. Wipe old rows, insert new rows
    5. Response includes { ok, count, updated, kept }

### Elevated TTL

    STEPUP_ELEVATED_TTL_SEC = 15 * 60 (raised from 5 min)

Reason: 5 minutes was too short for multi-step flows like "add passkey
then verify it appears" then "generate recovery codes". 15 minutes
covers a realistic session of high-risk work without re-prompting
mid-flow.

### Passkey scope (one per device)

Per WebAuthn spec, a passkey is unique to (user, RP, authenticator).
The same user cannot create two passkeys on the same physical
authenticator. To add a second, the user must use a different device
or a hardware security key.

The client sends excludeCredentials with all existing credential IDs,
so the authenticator itself refuses to create a duplicate. The
failure is surfaced to the user as "failed to register". This is
correct - it prevents silent duplication.

### Client-side step-up ordering (Session 5b fix)

Before: step-up dialog appeared AFTER the name dialog, causing the
user to enter a name and then be blocked.

After: step-up runs FIRST, then the name dialog opens. The elevated
token is fresh for the whole flow.


### Session restore and splash (Session 5c final)

Splash page:
    App starts at /splash. Redirect logic does NOT decide between
    welcome and home until auth state resolves. This eliminates the
    welcome-screen flicker on cold start.

Robust session restore:
    AuthNotifier.build() retries the /auth/me call up to 3 times on
    transient failures (cancel, timeout, connection error, 5xx).
    Tokens are only cleared on a real 401 or 403. Reloads, cancel
    errors, and network blips no longer log the user out.

Passkey login UX:
    Below "Sign in with a passkey" is a hint:
    "A passkey is not a password. Your browser will ask you to use
    Windows Hello, a security key, or your phone."

    Errors are mapped by describePasskeyError() to short friendly
    messages. Unknown-passkey cases show:
    "This passkey is not registered with any Telink account on this
    device." plus a dialog offering password login and re-registration.


## 10. OIDC Provider (Phase 1.5+)

Added in Phase 1.5a, hardened in Phase 1.5b1. Mounted at /oidc.

### What it is

A self-hosted OIDC (OpenID Connect) provider running inside the same NestJS
process. It is NOT a third-party service - it is our own code, using the
@replit/oidc-provider library (CommonJS fork of oidc-provider v8).

### Why it exists

- Standard token issuance (RFC 6749, OIDC Core)
- Standard refresh token rotation with replay detection (RFC 9700, Phase 1.5c)
- Future passkey support (Phase 1.5d)
- Future TOTP 2FA (Phase 1.5d)
- Bank-grade audit and token management

### Where it lives

```
libs/modules/oidc/src/
  oidc.module.ts          - NestJS module, wires providers
  oidc.service.ts         - owns the oidc-provider instance
  oidc.controller.ts      - mounts provider at /oidc/*
  oidc-prisma.adapter.ts  - persistence layer for OIDC state
  signing-key.service.ts  - RS256 keypair (auto-generated on first boot)
```

### Endpoints

All under `/oidc/`:

| Path | Purpose |
|---|---|
| /.well-known/openid-configuration | Discovery document |
| /jwks | Public keys for token verification |
| /auth | Authorization endpoint (Phase 1.5b2) |
| /token | Token endpoint (Phase 1.5b2) |
| /me | Userinfo endpoint |
| /session/end | Logout endpoint |
| /token/introspection | Token introspection (admin) |
| /token/revocation | Token revocation (admin) |

### Data model

```prisma
model OidcPayload {
  id         String    @map("id")
  modelName  String    @map("model_name")
  payload    Json
  grantId    String?   @map("grant_id")
  userCode   String?   @map("user_code")
  uid        String?   @map("uid")
  expiresAt  DateTime? @map("expires_at")
  consumedAt DateTime? @map("consumed_at")

  @@id([id, modelName])
  @@index([modelName])
  @@index([grantId])
  @@index([uid])
  @@index([expiresAt])
  @@map("oidc_payloads")
}

model OidcSigningKey {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  kid        String    @unique
  alg        String    @default("RS256")
  publicJwk  Json      @map("public_jwk")
  privateJwk Json      @map("private_jwk")
  active     Boolean   @default(true)
  createdAt  DateTime  @default(now()) @map("created_at")
  rotatedAt  DateTime? @map("rotated_at")

  @@index([active])
  @@map("oidc_signing_keys")
}
```

**Critical**: `privateJwk` must NEVER be exposed to any client. Only the
signing key service reads it, and only at boot. For production, wrap it with
envelope encryption (AWS KMS or HashiCorp Vault) - see Phase 16.

### Configuration

| Env var | Purpose | Default |
|---|---|---|
| OIDC_ISSUER | The issuer URL, must match what clients use | http://127.0.0.1:3000/oidc |
| OIDC_BFF_SECRET | Client secret for the BFF (added in 1.5b2) | dev-only |

### Signing key rotation (Phase 1.5d)

1. Generate new keypair, insert with `active = true`
2. Mark previous key `active = false`, `rotatedAt = now()`
3. Keep old key for verification window (e.g. 30 days)
4. Delete keys older than the verification window

### Security notes

- Cookies signed with JWT_SECRET
- PKCE required for all clients
- Tokens live in `oidc_payloads` and are consumed atomically
- `privateJwk` is plain JSON in Postgres - production must wrap with envelope encryption

### How to modify

- Change token TTL: edit `ttl` block in `oidc.service.ts`
- Add a scope: add to `scopes` array and to claims if it maps to claims
- Add a client: add to `clients` array (production: move to DB)
- Disable a feature: toggle in `features` block
- Rotate signing key: (Phase 1.5d) call `SigningKeyService.rotate()`

## 11. Changelog

- **2026-10-09** - Session 5c final polish: splash screen eliminates welcome-flash on cold start. Session restore retries transient failures up to 3x. Passkey error messages mapped to friendly text. Passkey login hint added. Login activity log page and backup passkey banner shipped earlier in the session.
- **2026-10-08** - Session 5b complete: Bio Verification page with real (device biometric + security questions) and mock (hand palmprint, face liveness, vein mode, iris) cards. Custom security questions allowed. Partial re-enrollment: change one slot without re-filling all. Elevated TTL raised to 15 min. Step-up prompts on recovery codes and passkey add/delete. Coming-soon bottom sheets reference MEMORY_BIOMETRICS.md. 64/64 backend e2e pass.
- **2026-10-08** - Session 5b polish: custom security questions allowed, change-lock requires step-up when already enrolled, client-side step-up prompts on recovery generate and passkey add/delete. Bio Verification page, security overview, coming-soon cards for hand/face/vein/iris. Backend step-up e2e tests: 64/64 pass.
- **2026-10-08** - Session 5b: Mobile step-up UI. Bio Verification page with real (device biometric + security questions) and mock (hand palmprint, face liveness, vein mode, iris) cards. Security questions enroll + verify screens. Security overview dashboard. Step-up dialog triggered before high-risk actions. Coming-soon bottom sheets reference MEMORY_BIOMETRICS.md. All info-level lint warnings cleaned.
- **2026-10-08** - Session 4b: Recovery codes UI + forgot password flow + logout confirmation. Profile -> Security -> Recovery codes page. Two-step reset flow from login screen. Logout now asks for confirmation. Full recovery lifecycle works end-to-end on web.
- **2026-10-08** - Session 4a: Account recovery backend. 10 one-time codes per user, hashed with Argon2id, two-step reset flow with 10-minute reset token. All sessions revoked on successful recovery. New RecoveryCode model and 4 endpoints (/generate, /status, /verify, /complete). Rate limited to 5 attempts/hour per email. Recovery emails sent on generate and complete. 8 new e2e tests. 55/55 e2e pass. Test env overrides added via test/setup-env.ts.
- **2026-10-08** - Session 3c: Auto-refresh on 401. Dio interceptor detects expired access tokens, calls /auth/refresh, re-signs DPoP, retries the original request. Concurrent 401s coalesce into a single refresh. Tokens are only cleared on genuine 401/403, not on cancel/offline/5xx. Verified: 2 parallel requests → 1 refresh → both retry → 200.
- **2026-10-07 (night)** - Session 3b: DPoP client. Browser generates ECDSA P-256 key, stores in IndexedDB as non-extractable, signs every request via Dio interceptor. Verified: with DPOP_ENFORCED=true, the browser works normally and PowerShell gets 401 "DPoP proof required". This is RFC 9449 proof-of-possession. Known gap: no automatic token refresh on 401.
- **2026-10-07 (evening)** - Session 3a: DPoP backend. Proof-of-possession verification (RFC 9449, ES256). New DpopService, DpopController, JwtAuthGuard enforcement. Session gained dpopPublicKeyJwk. Redis jti replay prevention. DPOP_ENFORCED=false by default. 9 new e2e tests. 46/46 e2e pass.
- **2026-10-07 (day)** - Session 2: IP-based geolocation. Server resolves client location from IP using DB-IP Lite (self-hosted MaxMind format). Client-supplied x-geo-lat/lng headers are now ignored. Impossible-travel detection is now spoof-resistant. New GeoService. 21/21 unit, 37/37 e2e pass.
- **2026-10-07 (day)** - Session 1: OIDC signing keys encrypted at rest with AES-256-GCM. Master key from SIGNING_KEY_MASTER env. Existing keys migrated on first boot. New CryptoService (5 unit tests). 21/21 unit, 34/34 e2e pass.
- **2026-10-07 (morning)** - Phase 1.5f2c: Sign in with passkey on web. Login screen now offers both password and passkey. Uses discoverable credentials when the email field is empty. Full passkey lifecycle (register, list, sign in, delete) is now complete on web. Mobile support deferred to 1.5f2d.
- **2026-10-06 (night)** - Phase 1.5f2b: Passkey registration UI working on web. Uses Chrome DevTools virtual authenticator for testing. Server-side user verification made optional (spec-aligned). Full CRUD: add, list, delete. All 34 backend e2e tests still pass.
- **2026-10-06 (night)** - Phase 1.5f2a: WebAuthn viability probe added at /debug/webauthn. Confirms SRWare Iron exposes WebAuthn APIs. Platform authenticator unavailable on dev machine, so passkey UI deferred to mobile build (Phase 1.5f2b). Backend (1.5f1) remains complete.
- **2026-10-06 (evening)** - Phase 1.5f1 complete. Passkeys (WebAuthn) backend: registration, login, list, delete. Uses @simplewebauthn/server@11. 6 new e2e tests. All 34 e2e pass. Mobile UI (Face ID / fingerprint prompt) deferred to Phase 1.5f2.
- **2026-10-06 (afternoon)** - Phase 1.5e complete. Mobile hardening: clipboard auto-clear, in-memory wipe on long background, secure storage audit, certificate pinning (config), jailbreak/root detection, screen capture prevention, anti-debug signal. Four features active on web; all seven active on mobile release builds. Flutter analyze clean, tests pass.
- **2026-10-06 (day)** - Phase 1.5d5 complete. Account lockout via Redis: 5 failed logins within 15 min locks the account for 15 min. Fails open on Redis errors so a cache outage never blocks auth. `LOCKOUT_DURATION_SEC` read at call time so tests can override. 4 new e2e tests. All 28 e2e pass.
- **2026-10-06 (morning)** - Phase 1.5d4 complete. Impossible travel detection via x-geo-lat/x-geo-lng headers. New event `auth.login.impossible_travel` with distance, elapsed time, and implied speed. Alert email sent. Thresholds: 900 km/h, 500 km minimum distance. 3 new e2e tests.
- **2026-10-06 (early)** - Phase 1.5d3 complete. Device identity via x-device-id header. New-device detection prefers device id over User-Agent. Added `details.detectionMethod` to `auth.login.new_device` events. 5 new e2e tests.
- **2026-10-05 (very late)** - Phase 1.5d2b complete. Login alert emails on new device. Every login (success/failure) written to security_events. POST /auth/login now returns isNewDevice. Detects new device by User-Agent until Phase 1.5d3.
- **2026-10-05 (night)** - Phase 1.5d2a complete. Session management endpoints: GET /auth/sessions, DELETE /auth/sessions/:id, DELETE /auth/sessions. Access token JWT now includes sessionId claim. Verified: 5 sessions listed with isCurrent flag, targeted revoke works, "revoke all others" works (revoked 6, 1 remains).
- **2026-10-05 (night)** - Phase 1.5c complete. Refresh tokens are opaque, stored hashed, rotated on every use. Replay detection revokes the entire session atomically. New tables refresh_tokens + security_events. POST /auth/refresh added. RFC 9700 compliant.
- **2026-10-05 (late)** - Phase 1.5d1 complete. Audit log is now readable via /admin/security-events. HMAC signature verification available at /admin/security-events/:id/verify. Role system added: user/support/moderator/admin/super_admin. RolesGuard enforces role checks. Users table gained role column.
- **2026-10-05 (evening)** - Phase 1.5b1 complete. OIDC provider uses Prisma-backed persistence (oidc_payloads) and stores a real RS256 keypair in oidc_signing_keys. Both dev-only warnings gone. State survives restarts. 16/16 tests pass (2 new OIDC smoke tests).
- **2026-10-05** - Phase 1.5a complete. OIDC provider mounted at /oidc. Discovery endpoint + JWKS live. Uses @replit/oidc-provider@8.8.0. No user-facing change yet. Existing /auth/* routes untouched.
- **2026-10-05** - Auth rework begins. Adding OIDC provider foundation. No user-facing change yet.
- **2026-10-04** - Email+password rework complete. Phone + email + password signup. 10/10 unit, 10/10 e2e.
- **2026-10-03** - Initial auth (phone OTP) replaced with new schema.