# Telink — Memory: Advanced Biometrics (future work)

> Status: RESEARCH — not implemented
> Created: 2026-10-08
> Purpose: capture every idea, verdict, and reference so we do not re-research later
> Rule: nothing in this file ships until we have a real mobile build

---

## 1. The user's original vision

Prove that the person using the account is the ORIGINAL owner.
Not just "someone with the password."
Not just "someone with the phone."
But "the same human being who created this account."

Layers the user proposed:
- 3D face
- Hand palmprint
- Hand veins
- Iris / eye
- Fingerprint (already available)
- Deep security questions only the owner can answer

Light-pattern innovation:
- Screen flashes different patterns on a black background
- Camera watches how the skin responds
- A photo, puppet, or fake hand cannot respond correctly
- Real skin responds differently than paper, plastic, or a screen
- This is the user's own idea and it is genuinely novel

Color-for-veins idea:
- Use a specific color/wavelength where hemoglobin absorbs
- Or reflects differently than surrounding skin
- Helps reveal veins under a plain RGB camera

---

## 2. What is possible today (verified)

| Feature | Verdict | Notes |
|---|---|---|
| Hand detection (21 landmarks) | ✅ Doable | MediaPipe Hand Landmarker |
| Palm ROI extraction | ✅ Doable | Crop using landmarks |
| Palmprint matching | ✅ Doable | OpenCV + own code |
| Light-pattern liveness | ✅ Doable | Pure OpenCV, no ML |
| Face detection + landmarks | ✅ Doable | MediaPipe Face Mesh |
| Face liveness | ✅ Doable | Light patterns + blink/turn |
| OS biometric (fingerprint, Face ID) | ✅ Doable | local_auth on mobile, WebAuthn on web |
| Security questions | ✅ Doable | Already planned |
| Voice liveness | ✅ Doable | speech_to_text + random phrase |
| Face recognition (1:1) | ✅ Doable | CompreFace self-hosted |
| Iris recognition | 🟡 Partial | open-iris works but ~85-90% on RGB |
| Palm vein | 🟡 Experimental | Depends on the camera. Test each device |
| 3D face on iOS | 🟡 Partial | ARKit TrueDepth works, but only iPhone X+ |
| 3D face on Android | ❌ Not viable | Almost no Android phone has depth camera |
| Iris bank-grade | ❌ Not viable | Requires near-infrared camera |

---

## 3. Open-source tools worth using later

### Hand tracking
- **MediaPipe Hand Landmarker** (Google, free)
  - 21 3D landmarks per hand
  - Runs on device (Android, iOS, Web via WASM)
  - Android sample project included
  - https://github.com/google-ai-edge/mediapipe

### Palmprint + palm vein
- **KBY-AI Palmprint-Recognition-Android**
  - Reference implementation, NOT a dependency
  - Uses hand landmarks + edge detection + 2D Gabor filters + palm-vein model
  - Requires commercial license for production
  - Contact KBY-AI for quote before using
- **Palm Vein Recognition reference**
  - Uses NIR + hemoglobin absorption
  - Some phone cameras capture partial NIR
  - Results vary by device

### Face detection + liveness
- **Vivd** (ajianaz/vivd) — face liveness, 100% on-device, no API key
- **flutter_face_liveness** — 468-point face mesh, YOLOv8n backend
- **mediapipe_face_mesh** — Google's own 478-landmark model

### Face recognition (server-side, self-hosted)
- **CompreFace** (exadel-inc/CompreFace)
  - Apache 2.0 license, commercial use allowed
  - ~8.1k stars, actively maintained
  - InsightFace models, 99.86% on LFW benchmark
  - Docker Compose one-liner deployment
  - REST API from any client

### Iris
- **worldcoin/open-iris** — iris recognition pipeline
  - pip install, runs on local server or on-device
  - Accuracy depends on camera quality (IR camera strongly preferred)

### Reference samples
- Google MediaPipe Android sample: https://github.com/google-ai-edge/mediapipe-samples
- CameraX + MediaPipe + image processing sample: search for "MediaPipe hand landmark Android sample"

---

## 4. Proposed architecture (for when we build mobile)

    ANDROID / iOS APP
         |
    +----+----+
    |         |
    Camera   Sensors
    |         |
    v         v
    MediaPipe Hand      Motion
    |
    v
    21 Hand Landmarks
    |
    v
    Palm ROI
    |
    +----+----+
    |         |
    v         v
    Palmprint  Liveness
    extraction engine
    |         |
    |    +----+-------------+
    |    |                  |
    |    v                  v
    |  Screen pattern    Temporal
    |  illumination      analysis
    |    |                  |
    |    +--------+---------+
    |             v
    |        Liveness score
    |             |
    +------+------+
           v
    LOCAL VERIFICATION

Everything runs on the phone.
No server. No cloud. No external hardware.

---

## 5. Light-pattern liveness (the user's innovation)

How it works:

    1. Show a black screen with a flashing pattern behind/around the hand
    2. Patterns like:
       Phase 1: all black
       Phase 2: all white
       Phase 3: checkerboard
       Phase 4: gradient
       Phase 5: random flicker
    3. Camera captures frames throughout
    4. Compare how the SAME skin region responds across phases

Signals that distinguish real skin from fakes:

- RGB channel differences over time
- Luminance response curve
- Local contrast change
- Edge response under different lighting
- Temporal difference between frames
- Optical flow consistency
- Specular highlight shape
- Texture consistency across frames
- Geometric consistency (hand shouldn't deform)

Liveness score formula (draft):

    Liveness =
        motion_consistency
      + texture_consistency
      + illumination_response
      + geometry_consistency
      + temporal_consistency

If score < threshold -> reject.

No ML model needed. Pure image processing. Very fast.

---

## 6. Vein imaging (experimental)

Physical basis:
- Hemoglobin absorbs blue and green light
- Hemoglobin reflects red and near-infrared
- So veins appear darker under red light
- Deeper veins show under NIR (700-900nm)

Phone camera limitations:
- Most phones have an IR-cut filter (blocks NIR)
- Some front cameras have weaker filters
- Dedicated IR LEDs would help but phones don't have them

Experimental pipeline:

    Camera
       v
    RGB channels
       v
    Controlled illumination (screen patterns)
       v
    Contrast enhancement (CLAHE)
       v
    Normalization
       v
    Gabor filters
       v
    Line / branch extraction
       v
    Vein-like map

Must be tested on multiple real phones.
If it works on some -> use as SUPPORTING signal only.
If it fails -> never claim "palm vein authentication".

---

## 7. What we are NOT building (be honest with users)

| Feature | Why not |
|---|---|
| 3D face scan on Android | No depth camera on 99% of devices |
| Bank-grade iris scan on RGB | Needs near-infrared, phone cameras are RGB |
| True palm vein auth without IR | Physics says no |
| Hand vein as PRIMARY factor | Only viable on specific devices with IR sensors |
| Behavioral biometrics at scale | Needs millions of samples to train |

Users must never be told these features exist when they don't.
If we advertise "3D face scan", it must actually work.

---

## 8. What we ARE building (in order)

### Session 5 (next)
- Security questions (3 per user, hashed with Argon2id)
- Step-up verification flow (biometric + 2 questions)
- Elevated token (5-min TTL) for high-risk actions
- Bio Verification section in Profile → Security with:
  - "Device biometric" — real, uses local_auth on mobile
  - "Security questions" — real, live
  - "Hand palmprint" — COMING SOON panel
  - "Face liveness" — COMING SOON panel
  - "Vein mode" — COMING SOON panel
  - "Iris scan" — COMING SOON panel

### When we do the mobile build
- MediaPipe Hand Landmarker integration
- Light-pattern liveness (the user's innovation)
- Face liveness via MediaPipe
- Palmprint extraction + matching (on-device)
- All the mock features activate

### When we have paying users
- CompreFace server-side face recognition (opt-in)
- Experimental vein mode (test on real devices)
- Reference KBY-AI license if we want their palmprint model

---

## 9. Key principles to remember

1. Never ship a biometric without proving liveness
2. Never claim a feature that a regular phone can't do
3. Prefer on-device over server (privacy + cost + speed)
4. Prefer open source over paid (no vendor lock)
5. Always show the user what is real vs coming soon
6. Active verification (light patterns) beats passive (face match)
7. Multi-factor > single factor
8. If in doubt, ask the user to prove it in a new way

---

## 10. References to keep

- MediaPipe: https://github.com/google-ai-edge/mediapipe
- MediaPipe samples: https://github.com/google-ai-edge/mediapipe-samples
- CompreFace: https://github.com/exadel-inc/CompreFace
- Vivd face liveness: https://github.com/ajianaz/vivd
- Face plugin (Flutter): https://github.com/Faceplugin-ltd/FaceRecognition-Flutter
- Open iris: https://github.com/worldcoin/open-iris
- KBY-AI (commercial, for reference): https://github.com/kby-ai
- flutter_face_liveness: pub.dev/packages/flutter_face_liveness
- mediapipe_face_mesh: pub.dev/packages/mediapipe_face_mesh

---

## 11. Changelog

- 2026-10-08 — File created. Captures user vision, research findings,
  and decisions. Mocks implemented in Profile -> Security -> Bio
  Verification. Real implementation deferred to mobile build.