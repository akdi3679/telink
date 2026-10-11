# Telink — Complete Handoff for the Next AI Session

> **Read this entire file before doing anything.** It contains:
> 1. What the project is (product + architecture)
> 2. What's been built from the very beginning
> 3. Current state (exact)
> 4. What remains — 5 specific tasks with plans
> 5. Profile completion field list (complete, from user)
> 6. Roadmap phases
> 7. Constraints, environment, testing setup
> 8. Known issues + workarounds
> 9. Recommended next action

---

## 1. What Telink is

Mobile-first professional network + local utilities. **Tunisia first**, expandable to Morocco, Algeria, France, Gulf.

**Product:**
- 3 tabs only: **Home** (feed, map preview, News 24, jobs, network) / **Phone** (dialer, SMS reader, contacts, messages, favorites) / **Profile** (fiche with 5 sub-tabs: general, contact, medical [admin-only], call/sms, settings)
- Progressive onboarding **inside Profile** — never blocks app access
- Jobs = post + discover only (no hire flow in v1)
- SMS = OTP only (no SMS between users)
- Contacts = hybrid hash match (no upload)
- Visitor analytics = count only
- Arabic primary (RTL) + French + English

**Not in product:**
- No third-party auth services (no Auth0, no Google, no Okta)
- No external AI services
- No paid services except: Hetzner server, Apple/Play developer accounts, Vonage SMS

## 2. Architecture
telinke/
├── telink_api/ NestJS backend (modular monolith)
│ ├── apps/api HTTP + WebSocket API (port 3000)
│ ├── apps/workers BullMQ workers (not yet used)
│ ├── apps/admin-cli Operator CLI
│ ├── libs/core Shared kernel: config, Prisma, Redis, audit, errors, crypto, geo, security, email
│ ├── libs/modules/ Feature modules: auth, users, oidc, ...
│ └── prisma/ Schema (30+ models, 7 schemas), migrations, seed
├── telink_app/ Flutter mobile + web
│ └── lib/
│ ├── core/ env, network, storage, routing, security, i18n, theme, widgets
│ ├── features/ auth, feed, map, news, search, phone, profile, messages, jobs, notes, alarms, notifications
│ └── shared/ MainShell (3-tab navigation)
├── telink_admin/ Next.js 14 admin (not yet started)
├── docs/
│ └── features/
│ └── auth.md Full auth documentation
└── .github/
└── workflows/
└── flutter-build.yml CI: builds APK + uploads to Appetize

text

**Tech stack (locked):**

| Layer | Tech |
|---|---|
| Mobile | Flutter 3.35+, Riverpod, GoRouter, Dio, flutter_secure_storage, MapLibre (later) |
| Backend | NestJS 10, TypeScript strict, Prisma 5.20, PostgreSQL 16 (Supabase in dev), Redis (Upstash), BullMQ, Meilisearch (later), MinIO (later) |
| Auth | Custom JWT + DPoP (RFC 9449) + passkeys (WebAuthn, @simplewebauthn) + step-up (questions + biometric) |
| Crypto | Argon2id (@node-rs/argon2), AES-256-GCM for OIDC keys, HMAC-SHA256 for audit |
| Admin | Next.js 14 (not built yet) |
| CI | GitHub Actions → release APK → Appetize.io |
| Deploy (target) | Hetzner + Cloudflare free + Caddy |

## 3. What has been built (from day 1 to now)

### Phases completed

| Phase | What | Status |
|---|---|---|
| 0 | Foundation: NestJS monorepo, Postgres, Redis, `/health` | ✅ |
| 1 | Auth (all sub-phases — see §4) | ✅ |
| 2 | Mobile auth flow (signup, login, OTP, home) | ✅ tested on real phone |
| 3 | Users + Profile (basic: name, headline, bio, work) | ✅ |
| 4 | Feed | ❌ next |
| 5–17 | (see §7) | ❌ |

### Auth sub-phases completed (Phase 1 detailed)

| Sub-phase | What | Verified |
|---|---|---|
| 1.5a | OIDC provider mounted at `/oidc` (via `@replit/oidc-provider`) | ✅ discovery + JWKS live |
| 1.5b1 | Prisma-backed OIDC adapter + RS256 keys (encrypted at rest) | ✅ |
| 1.5c | Refresh token rotation + replay detection (RFC 9700) | ✅ atomic CAS |
| 1.5d1 | Audit log surface + role-based access | ✅ `/admin/security-events` |
| 1.5d2a | Session management (list, revoke one, revoke all others) | ✅ |
| 1.5d2b | Login alerts on new device | ✅ email sent |
| 1.5d3 | Device identity via `x-device-id` | ✅ preferred over UA |
| 1.5d4 | Impossible travel detection (IP-based, DB-IP Lite) | ✅ |
| 1.5d5 | Account lockout (Redis, fails open) | ✅ |
| 1.5e | Mobile hardening (clipboard wipe, background wipe, storage audit, cert pinning config, screen capture, anti-debug) | ✅ code written; activates on mobile build |
| 1.5f1 | Passkeys backend (register, login, list, delete) | ✅ 6 endpoints |
| 1.5f2a | WebAuthn viability check | ✅ |
| 1.5f2b | Passkey registration UI (web) | ✅ works |
| 1.5f2c | Passkey sign-in UI (web) | ✅ works |
| S1 | Signing key encryption (AES-256-GCM) | ✅ |
| S2 | IP-based geolocation (DB-IP Lite, self-hosted) | ✅ |
| S3a | DPoP backend (RFC 9449, ES256) | ✅ |
| S3b | DPoP client (web — ECDSA P-256 in IndexedDB) | ✅ |
| S3c | Auto-refresh on 401 (with coalescing) | ✅ |
| S4a | Account recovery backend (10 codes, two-step reset) | ✅ |
| S4b | Recovery codes UI + forgot password flow + logout confirmation | ✅ |
| S5a | Step-up verification backend (security questions + elevated token) | ✅ |
| S5b | Bio Verification page + Security overview + Login activity + backup passkey banner | ✅ |
| S5c | Splash screen, robust session restore, passkey error mapping | ✅ |
| S6 | Active sessions UI + mobile passkey coming-soon sheet | ✅ just added |

**Test count:** 64/64 backend e2e + 21/21 backend unit + 1/1 mobile widget test.

### What's actually deployed

- Backend runs locally on user's PC (port 3000)
- Backend exposed to phone via `adb reverse tcp:3000 tcp:3000`
- Mobile app installed on user's real Android phone
- Mobile build produces release APK via GitHub Actions, artifact downloadable
- Mobile app can reach backend via localhost (adb reverse)
- Login, profile view, profile edit, session management, recovery codes, step-up, login activity, passkeys (partial) all work on the phone

### What's verified working

- Password signup + login (phone + email + password, email OTP)
- Passkeys on web (register + sign in)
- Passkey registration backend (mobile UI missing — coming soon sheet shows)
- DPoP on web (mobile uses stub)
- Refresh token rotation + replay detection
- Session management (list, revoke one, revoke all others)
- Login alerts
- Impossible travel (tested with Tunis → Paris)
- Account lockout (5 failed logins = 15 min lock)
- Recovery codes (generate, verify, complete reset)
- Security questions (enroll, verify)
- Step-up verification (biometric placeholder + 2 of 3 questions → 15 min elevated)
- Login activity log
- Backup passkey prompt

### What's NOT verified (code exists, not tested end-to-end)

- Mobile DPoP (stub returns null — server DPoP enforcement must be off)
- Mobile passkeys native prompt (needs `passkeys` package)
- Cert pinning on mobile (config present, not active)
- Screen capture prevention (stub)
- Jailbreak detection (stub)
- Clipboard auto-clear (code exists, not tested on phone)
- Background token wipe (code exists, not tested on phone)

## 4. The 5 remaining tasks (detailed)

### Task 1 — Profile completion backend

**Goal:** Build 13 endpoint groups for existing schema tables + missing schema additions + profile completion calculator.

**Schema already has these tables (need endpoints):**
- `UserSkill` (name, level, endorsedCount) — CRUD
- `UserEducation` (school, degree, fieldOfStudy, startDate, endDate, description) — CRUD
- `UserExperience` (jobTitle, companyName, location, country, startDate, endDate, currentlyWorking, description) — CRUD
- `UserHobby` (name) — CRUD
- `UserInterest` (name) — CRUD
- `UserTravel` (country, year) — CRUD
- `UserFormation` (name, type, year, issuer) — CRUD
- `UserMedical` (problem, note, allergies, treatment, blood, organDonor, weightKg, heightCm, emergencyContactName, emergencyContactPhone) — CRUD, encrypted at rest
- `UserContact` (country, city, address, lat, lng) — extend
- `UserLink` (type, url) — CRUD (already partial)

**Missing schema (add):**
- `timeOfWeek` (hours/week) → add to UserProfile
- `dateOfBirth` → add to UserContact
- `AssociatedName` (new table: userId, name) → for "associated names"
- `Earnings` (new table: userId, hourlyRate, platformFee (10% computed), net (computed))
- `CallSmsPreferences` (new table: userId, callSound, smsSound, instantMessage bool, customRingtone, customSmsTone)
- `PrivacySettings` (new table: userId + 5+ boolean toggles)
- `NotificationPreferences` (new table: userId + 5+ boolean toggles)

**Endpoints to build:**
GET /profile/me (full profile, all sections)
GET /profile/completion (which sections/fields are filled)
GET /profile/skills (list)
POST /profile/skills (add)
PATCH /profile/skills/:id (update)
DELETE /profile/skills/:id (remove)
(and the same pattern for education, experience, hobbies, interests, travels, formations)
GET /profile/contact-extended (dob, associated names)
POST /profile/associated-names
DELETE /profile/associated-names/:id
GET /profile/medical (step-up required)
PUT /profile/medical (step-up required, encrypted)
GET /profile/earnings
PUT /profile/earnings
GET /profile/preferences/call-sms
PUT /profile/preferences/call-sms
GET /profile/preferences/privacy
PUT /profile/preferences/privacy
GET /profile/preferences/notifications
PUT /profile/preferences/notifications

text

**Estimated sessions:** 2

### Task 2 — Profile completion mobile UI

**Goal:** 5-tab profile layout with completion indicators.

**Layout:**
Profile tab
├── Fiche (view) — General / Contact / Medical / Call & SMS / Settings
│ ├── General tab: photo, banner, name, workTitle, headline, bio, category,
│ │ formation list, experiences list, education list, hobbies,
│ │ interests, travels, languages, timeOfWeek, availabilityStatus,
│ │ rating (read-only), qrCode, followers/following, visitorCount
│ ├── Contact tab: phone primary/secondary, email, LinkedIn, website,
│ │ other URLs, address, dob, associatedNames, languages
│ ├── Medical tab (admin-only): conditions, allergies, treatment,
│ │ bloodType, donorOrgans, weight, height, emergency contact
│ ├── Call/SMS tab: callSound, smsSound, instantMessage toggle,
│ │ customRingtone, customSmsTone
│ └── Settings tab: privacy, notifications, 2FA, sessions, change pw,
│ language, theme, logout, delete account
└── Completion widget (dashboard style) — shows % complete + per-section status

text

**Completion indicator:** For each field, show a green check if filled, orange "Add" if empty. On tap → go to that field's editor.

**Estimated sessions:** 2

### Task 3 — Mobile DPoP (real implementation)

**Goal:** Replace the mobile stub with a real DPoP client using Android Keystore.

**What's needed:**
- Flutter package: `cryptography` for ECDSA P-256 keygen
- Store private key in Android Keystore via `flutter_secure_storage` (or `flutter_keychain`)
- Sign every request with a DPoP proof (same logic as web)
- Server already accepts — just flip `DPOP_ENFORCED=true` after this works

**Estimated sessions:** 1

### Task 4 — Mobile passkeys (native Android Credential Manager)

**Goal:** Use the `passkeys` Flutter package to trigger native Android biometric prompt.

**What's needed:**
- Package: `passkeys` (community, wraps Android Credential Manager + iOS ASAuthorization)
- Replace the coming-soon sheet with the native call
- Web version already works — only the mobile flow needs the new package

**Estimated sessions:** 1–2

### Task 5 — S5 Hardware attestation (Play Integrity)

**Goal:** Prove the app is unmodified on a genuine Android device.

**Blockers:**
- Needs **Google Play Console account ($25 one-time)**
- Needs the app **published to Internal Testing track**
- Play Integrity **does not work on emulators** — requires a real Android phone

**Can do without $25:** Write the server-side verification code (verify signed token against Google JWKS). Mock the client side. When $25 is paid + real phone available, enable.

**Estimated sessions:** 1 (server-side only now)

### Bonus — S6 Behavioral biometrics

Rules-based on-device detection (no ML). Runs locally. Sends only "anomaly: yes/no" to server. ~2 sessions when users are plentiful.

## 5. Full field list for profile (from user, not to lose)

**Stage 2 onboarding sub-screens:**
- **Role selection:** role (8 options, multi-select)
- **Reasons/goals:** multi-select + custom "other"
- **Career upload:** resume PDF (or fill manually / AI fill)
- **Work category:** category, specialty, institution, location URL, contact phone, contact email, website
- **Skills:** ≥1 skill (repeating)
- **Experience:** jobTitle, company, location, country, startDate, endDate, isCurrent, description — ≥1 entry
- **Education:** school, degree, fieldOfStudy, startDate, endDate, description — ≥1 entry
- **Earnings:** hourlyRate (platform fee 10% + net auto-calculated)
- **Profile details:** 2 photos, name, lastName, email, username, dob, phone, location, headline, bio

**Stage 3 fiche tabs:**

**General tab (visible to all):** profilePhoto, backgroundPhoto, name, lastName, workTitle, bio, headline, category, formation, experiences, school, loisirs (hobbies), interests, voyage (travel), languages, timeOfWork, availabilityStatus, rating (auto), qrCode (auto), followers/following (auto), visitorCount (auto)

**Contact tab (visible to all):** phone primary, phone secondary, email, LinkedIn URL, website URL, other URLs, address, dob, associatedNames, languages

**Medical tab (admin only):** medicalConditions, allergies + reactions, treatment, bloodType, donorOrgans, weight, height, emergencyContact (name + phone + relation)

**Call/SMS tab (visible to all):** callSound, smsSound, instantMessage, customRingtone, customSmsTone

**Settings tab (owner only):** privacyControls (5+ toggles), notificationPreferences (5+ toggles), 2FA, sessions, change password, language, theme, logout, delete account

## 6. Roadmap phases

| # | Phase | What | Sessions |
|---|---|---|---|
| 0–3 | Foundation + Auth + Profile basic | Done |
| **4** | Feed (posts, comments, reactions, follow) | 3 |
| 5 | Map (real-time friends, jobs, meteo) | 2–3 |
| 6 | News "24" (RSS, expand/collapse, bookmarks) | 1 |
| 7 | Search (unified, geo-aware, Meilisearch) | 2 |
| 8 | Phone + Msg + Contacts (local SIM UI, no in-app chat in v1) | 3–4 |
| 9 | Jobs (post + discover only, no hire flow) | 2 |
| 10 | Notes (E2E encrypted, server stores ciphertext) | 1 |
| 11 | Alarms (recurring, synced) | 1 |
| 12 | Notifications (in-app inbox + push via FCM) | 1 |
| 13 | Analytics (PostHog self-hosted, feature flags, A/B) | 1 |
| 14 | Admin panel (Next.js 14, RBAC, audit log, moderation) | 2–3 |
| 15 | Cross-cutting (GDPR export/erase, i18n polish, a11y) | 2 |
| 16 | Scale + deploy (Hetzner, Caddy, backups, k8s optional) | 2–3 |
| 17 | Ads platform (GDPR-safe, consent-gated, self-hosted) | 3–5 |

**After all phases: ~40 sessions to ship complete v1.**

## 7. Critical constraints (never violate)

1. **No paid services** except Hetzner (~€15/mo), Apple ($99/yr), Google Play ($25 once), Vonage SMS (~€0.005/OTP)
2. **No third-party auth** — all self-hosted on own server
3. **No external AI** — local models or on-device when needed
4. **3 tabs only** — Home, Phone, Profile
5. **Onboarding progressive** — never blocks app access
6. **All profile fields required** — no optional fields in profile
7. **Tunisia first** (+216)
8. **Arabic primary with RTL** + French + English
9. **Modular monolith** — Strangler-ready, no premature microservices
10. **OWASP MASVS L2** security minimum
11. **Visitor analytics = count only**
12. **Jobs = post + discover only** (no hire flow in v1)
13. **SMS = OTP only** (no SMS between users)
14. **Contacts = hybrid hash match** (no upload)
15. **Maps = MapLibre + OpenFreeMap** (no Google Maps)
16. **Real-time location** = Snap-Map style, visible to connections
17. **Every feature has tests before "done"**
18. **Update `docs/features/<name>.md` after every change**
19. **Commit format: `[P{N}-S{step}] Description`**

## 8. Environment setup

### Backend
```bash
cd telink_api
pnpm install
pnpm prisma:generate
pnpm start:dev                    # port 3000
.env keys that matter:

DATABASE_URL — Supabase session pooler with ?pgbouncer=true&connection_limit=1

REDIS_URL — Upstash rediss://...

DPOP_ENFORCED=false (during mobile testing — turn on for web)

STEPUP_ENFORCED=true

JWT_EXPIRES_IN=15m

WEBAUTHN_RP_ID=localhost, WEBAUTHN_ORIGIN=http://localhost:8080

Mobile (web)
bash
cd telink_app
flutter run -d web-server --web-port=8080
Mobile (Android phone)
bash
adb reverse tcp:3000 tcp:3000
flutter run -d <device-id> --dart-define=API_URL=http://localhost:3000
Or install the release APK from GitHub Actions:

bash
adb install -r "$env:USERPROFILE\Downloads\apk-extracted\app-arm64-v8a-release.apk"
CI workflow (flutter-build.yml)
Runs on push to telink_app/**

Java 17, Flutter stable

flutter pub get, analyze, test

flutter build apk --release --split-per-abi --dart-define=API_URL=http://localhost:3000

Uploads artifact telink-apks

Also uploads to Appetize (secret APPETIZE_TOKEN)

9. Known issues + workarounds
Issue	Fix
Mobile app can't reach local backend	adb reverse tcp:3000 tcp:3000 + cleartext config in AndroidManifest
flutter_secure_storage Keystore failure on Android release	Interceptor catches and continues; not yet root-caused
Mobile DPoP stub returns null	Set DPOP_ENFORCED=false while mobile testing
Appetize upload times out	Use --split-per-abi release APK (~20 MB), not debug (~70 MB)
Supabase pooler cold start (P1001)	?connect_timeout=30&pool_timeout=30 in DATABASE_URL
Old Flutter plugins break AGP 8+	Removed flutter_jailbreak_detection, flutter_windowmanager, no_screenshot; stubbed their Flutter usage
Android release blocks HTTP	usesCleartextTraffic="true" in AndroidManifest + INTERNET permission
Gradle/AGP/Kotlin version mismatch	Gradle 8.14.2, AGP 8.11.1, Kotlin 2.2.20 in android/settings.gradle.kts and gradle-wrapper.properties
nest-oidc-provider with ESM-only oidc-provider	Use @replit/oidc-provider (CJS fork)
10. Documentation location
docs/features/auth.md — the ONLY feature doc so far. Complete. Read this for auth.

MEMORY_BIOMETRICS.md at project root — future biometric features (hand palmprint, face liveness, vein mode, iris)

Create docs/features/<name>.md for every new feature

11. Recommended first action for the next session
Ask the user to pick one:

Profile completion backend (2 sessions) — biggest gap, most requested

Mobile DPoP (1 session) — unblocks full authentication on mobile

Mobile passkeys (1–2 sessions) — high user value

Phase 4 — Feed (3 sessions) — start visible product work

Cleanup: change password UI, delete account UI, 2FA placeholder (1 session) — small settings gaps found in phone testing

My recommendation: Profile completion backend. The user explicitly wants the full profile with every section from the docs. It's the largest outstanding item and unblocks a big chunk of the app.

12. How to work with this user
They want real, working code — not mocks, not placeholders

They want tests — every feature must pass flutter analyze + pnpm test + pnpm test:e2e before "done"

They want honest answers — if something can't be done, say so with a reason and an alternative

They want docs updated — after every change, update docs/features/<name>.md and the changelog

They test on a real Android phone — every mobile feature must be verified on the phone before claiming success

They will not use third-party services — no Auth0, no external AI, no cloud ML

They push back on overselling — if you say "bank-level" or "100% secure", they'll ask you to prove it

They push back on missing scope — if you skip fields or sections, they will notice and ask again

## 13. What's missing / just added

### Added in the last two sessions

- ✅ Active sessions page (`/profile/sessions`) with "Sign out of all other sessions" button
- ✅ Mobile passkey FAB (shows coming-soon sheet on mobile; full flow on web)
- ✅ Change password page (`/profile/change-password`) + backend `POST /auth/password/change`
- ✅ Delete account page (`/profile/delete-account`) + backend `DELETE /auth/account`
- ✅ Two-factor placeholder page (`/profile/2fa`) explaining passkeys vs TOTP

### Still missing

| Item | Where | Effort |
|---|---|---|
| Profile completion backend | Backend | 2 sessions |
| Profile completion mobile UI (5 sub-tabs + completion widget) | Mobile | 2 sessions |
| Mobile DPoP (real, not stub) | Mobile | 1 session |
| Mobile passkeys (native Android Credential Manager) | Mobile | 1–2 sessions |
| S5 Hardware attestation (server-side only, mock client) | Backend | 1 session |
| OIDC token migration | Backend | 3–5 sessions |
| Phase 4 — Feed | Both | 3 sessions |
| Phases 5–17 | Both | 25+ sessions |

### Verified on the phone (last test)

| Feature | Works |
|---|---|
| Login with password | ✅ |
| Login persists after closing app | ✅ |
| Profile tab loads | ✅ (after `DPOP_ENFORCED=false`) |
| Profile edit saves | ✅ |
| Active sessions list shows | ✅ |
| Recovery codes generate + verify | ✅ |
| Step-up verification | ✅ |
| Login activity log | ✅ |
| Logout confirmation | ✅ |

### Not yet verified on phone

- Change password (just added — needs test)
- Delete account (just added — needs test)
- 2FA page (just added — needs test)
- Passkey native flow (still coming-soon sheet)
- Mobile DPoP (uses stub, server has enforcement off)
14. TL;DR for a new AI
Telink is 4 phases in. Auth + basic Profile work. 13 more phases remain.

Backend: 64/64 e2e tests pass. Everything is stable.

Mobile: works on real Android phone via adb reverse.

Profile completion is the next big task — 13 endpoint groups, missing schema, 5-tab UI, completion indicator. All fields from §5 must be present.

Do not use third-party services, do not mock, write tests, update docs, commit with the format.

Read docs/features/auth.md for the full auth architecture.

Every decision has a reason — the docs explain them. If something seems missing, it's probably in a doc.

Go.