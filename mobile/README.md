# Subturtle mobile app (Flutter)

The first version of the Subturtle phone app for iOS and Android. It lets
learners do four things: do today's step, review phrases, save a phrase, and
talk with the coach.

It uses **only the backend that exists today**. No server code was changed.
Where the design needs something the backend does not have, the app leaves it
out or shows a simpler version. These gaps are listed in
[Needs backend work](#needs-backend-work).

- Design source: the Claude Design canvas "Subturtle Mobile Layouts" (17 phone
  screens and a tokens board) and the UX spec (`ux-spec.md`) in the design handoff.
- Design system: "Subturtle Design System (main)": rose `#f91e5a`, jade `#14b485`,
  warm mauve neutrals, Nunito, Solar icons, light and dark.

## Run it

You need Flutter 3.47 or newer (Dart 3.9+), Xcode for iOS, and the Android SDK for Android.

```bash
cd mobile
flutter pub get          # one lockfile for the whole workspace
cd apps/subturtle
flutter run              # talks to the DEV API by default
```

Settings are passed with `--dart-define`:

| Name | Default | What it does |
| --- | --- | --- |
| `API_BASE_URL` | DEV API (`https://subturtle-api-466506592387.europe-west4.run.app`) | The backend. PROD is `https://subturtle-api-245138511605.europe-west4.run.app`. For a local server: `http://localhost:8080` (iOS simulator) or `http://10.0.2.2:8080` (Android emulator). |
| `DASHBOARD_URL` | dev or prod dashboard, following the API | Where "Manage" and "More on the web" open. |
| `GOOGLE_SERVER_CLIENT_ID` | empty | The web OAuth client id. Without it, the Google button shows "not set up". See [Google sign-in](#google-sign-in). |
| `GOOGLE_IOS_CLIENT_ID` | empty | The iOS OAuth client id. |
| `ENABLE_CODE_SIGNUP` | `false` | Shows "Create an account with a code". This only works against a non-production server (the code is `123456` there). |

Example:

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:8080 --dart-define=ENABLE_CODE_SIGNUP=true
```

The API base URLs are not secrets (they are in the web app's public bundle).
No keys, tokens or passwords are stored in this folder.

### Checks

```bash
# from mobile/
(cd packages/subturtle_ui && flutter analyze && flutter test)
(cd packages/subturtle_ui/example && flutter analyze)
(cd packages/subturtle_api && flutter analyze && dart test)
(cd apps/subturtle && flutter analyze && flutter test)
(cd apps/subturtle && flutter build apk --debug)
(cd apps/subturtle && flutter build ios --simulator --no-codesign)
```

All tests use fakes. Nothing signs in to dev or prod.

## Layout

```
mobile/
  pubspec.yaml               Dart pub workspace (one lockfile)
  apps/subturtle/            the app: routing, state, screens
    lib/app/                 config, providers (Riverpod), router (go_router), share intake
    lib/features/<feature>/  auth, today, pool, review, capture, bundles, phrase, coach, live_session, me, plans
    lib/shared/              small shared widgets and helpers
  packages/subturtle_ui/     design kit: tokens, theme, Solar icons, components, gallery app (example/)
  packages/subturtle_api/    API client: a Dart port of @modular-rest/client + one repository per backend module
```

- **subturtle_ui** has no app logic. See its [README](packages/subturtle_ui/README.md).
- **subturtle_api** is pure Dart (no Flutter). See its [README](packages/subturtle_api/README.md).
- **The app** uses Riverpod for state and go_router for routes. The four tabs
  are a `StatefulShellRoute`, so each tab keeps its own back stack. Full-screen
  tasks (review, pool, live session) sit on the root navigator, so the tab bar
  is hidden there. Capture and the other sheets are modal bottom sheets.

## Screens

| Screen (design) | Status | Notes |
| --- | --- | --- |
| S1 Sign in | Partial | Google (needs client ids as config, see below) and email + **password**. No Sign in with Apple and no email one-time code: the backend has neither (see below). |
| S3 Today | Works | Hero card picks the next step: review due → new words → first phrase → done. Optional cards: new words, coach (with the voice meter, amber at 80%), Starter save cap (max one plan card), Chrome extension link. Pull to refresh, skeletons, error with "Try again", keeps the last board on a failed refresh. |
| S4 Pool player | Works | Reveal / Flip back / Next, swipe left after reveal, "Previous". The end calls `complete-pool-session`. Session size = the user's pool chunk size. |
| S5 Smart Review | Works | Recognition card (levels 1–2) and fill-the-gap card (level 3+, when a chunk is in the sentence). Forgiving check (case, spaces, end marks, contractions, small typos = "Almost"). Forgot / Learned, swipe after reveal with tilt and threshold haptic, keyboard ←/→/space, screen-reader actions. **Undo**: see "Decisions". |
| S6 Summary | Works | Learned / To review / Time, "Look at these again", "Next: N new words". |
| S7 Bundles | Works | Sort (Recent / Most due / A–Z), due pill, long-press actions (rename, review, coach, delete), full-screen search over bundles and phrases. |
| S8 Bundle detail | Works | Review N, Talk with Coach, level dots, swipe left to delete with 5 s undo, ⋯ menu. |
| S9 Phrase sheet | Works | Draggable sheet: sentence with phrase and chunks marked, source link, editable translation, definition, transliteration, chunk notes, move / delete, Practise with Coach. |
| S10 Capture | Partial | Paste box (+ Paste chip), save sheet with tap-the-words chips, live translation preview, bundle picker with "+ New bundle", Starter limit state. Saves a full "linguistic" phrase (like the extension). **Share sheet: Android only** (see below). No offline queue: an offline save shows an error. |
| S11 Coach home | Works | Minutes meter, Start a session, recent sessions. Starter sees "past sessions show on a paid plan" (the backend locks history for Starter). |
| S12 Start a session | Works | Bundle, Voice / Text, coach voice (with a TTS preview like the web), minutes meter, mic permission on the first Start tap. Practises the 10 newest phrases of the bundle. |
| S13 Live voice | Built, not tested with a real account | Full UI and a Dart Gemini Live client (WebSocket) with the server's ephemeral token, 16 kHz mic in, 24 kHz audio out, captions, phrase cards, tool calls, transcript and usage saved, resume before the 15-minute limit and on `goAway`, free timer and minutes cap panel, wakelock. See [Voice](#voice). |
| S14 Live text | Works (with fakes) | Same tool loop as the web, retry on a failed message, per-chat cap note, typing dots, phrase strip. |
| S15 Transcript | Works | Read-only, voice or text. |
| S16 Voice cap sheet | Works | Opens only when Start (voice) is tapped with 0 minutes. Minutes only, never "credit". |
| S17 Me | Partial | Profile, 3 small stats, plan row, translation language, haptics, theme, web links, sign out. Daily reminder is not built. Delete account is "email us" (no API). The streak needs the Learner plan (it reuses the web's chart function). |
| S18 Your plan | Works (read only) | Current plan, renew date, meters, all plans with monthly / yearly prices. "Manage on the web" opens the web dashboard. No in-app purchase. |
| S2 Onboarding | Not built | Not in the design canvas for this round. The language step is in Me → Translate into. |

## Decisions (and why)

1. **Undo in Smart Review holds the last grade back.** The backend has no undo:
   `submit-review` moves the card at once. So the app keeps the newest grade on
   the phone and sends it when the learner grades the next card, ends the
   session, or leaves the app. Undo (↶ or the toast) just drops it. One step, as
   the spec asks. Code: `GradeQueue` in `features/review/review_logic.dart`.
2. **Translation language lives on the phone.** The profile has no language
   field. The app guesses it from the newest saved phrase, then the phone's
   language, and the learner can change it in Me. It is sent as the English
   name ("Persian"), like the extension does.
3. **Email sign-in uses a password.** See below.
4. **Session phrases** = the 10 newest phrases of the bundle (the web has a
   range picker; the mobile spec asks for few choices).
5. **The voice mic is open from the start** (a call, not push-to-talk), as the
   spec says. The web starts muted.
6. **Voice time** is charged once at the end with `debit-voice-minutes`,
   counting only the time the socket was connected.
7. **Buttons are 48 dp tall** (DS `Button lg`), as the canvas uses, not the
   56 dp in the older UX text. Tap areas are never under 48 dp.
8. **Fonts and icons are bundled** (Nunito + Vazirmatn, OFL; Solar icons from the
   web kit's data), so the app does not fetch them at run time.
9. **Toast colours in dark mode.** The DS toast is `ink-950` with white text,
   which becomes white-on-white in dark mode. The kit uses `surface-inverse` + `paper`.
10. **Android id** is `app.subturtle.subturtle` (Flutter's default from the
    org + name). Change it before the first store upload if you want another one.

## Needs backend work

| What | Why it is needed |
| --- | --- |
| **Sign in with Apple** | No Apple route on the server. The App Store requires it when Google sign-in is offered. Also needs account linking for people who signed up with Google on the web. |
| **Email one-time-code sign-in** | `/user/register_id` makes a code, but nothing emails it, and in production the code is random on purpose (it would let anyone reset any account). A real passwordless flow needs a "send code by email" + "sign in with code" route. |
| **Mobile Google client ids** | `/auth/google/access-token-login` only accepts tokens issued to the web client or ids in `GOOGLE_OAUTH_CLIENT_ID_EXTENSION`. Add the iOS and Android OAuth client ids there (config only, no code). |
| **In-app purchase** | Plans and minute top-ups are Stripe-only. Apple / Google may require in-app purchase; that needs receipt checks and store webhooks. For now "Manage" opens the web. |
| **Delete account API** | Both stores require in-app account deletion. Today the app offers "email us". |
| **Offline grade sync** | Review needs cached cards and a way to send late grades (and rules when the web also graded). Today an offline grade is kept for the session and retried, but not stored across app restarts. |
| **Offline save queue** | Same idea for Capture. |
| **Voice ↔ text in one session** | A voice and a text session are different records. The ⌨ button ends voice and starts a new text chat with the same bundle. |
| **Translation language on the profile** | So the phone and the web agree on the L1. |
| **Board "next step" order and more card types** | `get-board` only returns `leitner_review`. The app builds the other cards itself. |
| **Streak and "minutes talked" for every plan** | The streak reuses `generateChartDataForInsertionRatio`, which is locked below Learner. |
| **Email the Chrome extension link** | No "send me the link" function; the app copies the link instead. |
| **Session history for Starter** | `list-live-sessions` is locked for Starter, so the Coach list shows a lock. |

## Share sheet

- **Android**: works. "Share" text from any app → "Save to Subturtle" opens the
  save sheet. `MainActivity.kt` passes the text over the `app.subturtle/share` channel.
- **iOS**: not built. iOS needs a Share Extension target with its own bundle id,
  signing and an App Group to hand the text to the app. That is a signing task,
  not code, so it was left for when the Apple team is set up. The paste box and
  the `subturtle://app/capture?text=…` deep link work on iOS.

## Deep links

The app scheme is `subturtle`. Put the path after a host, for example
`subturtle://app/today`, `subturtle://app/bundles/<id>`, `subturtle://app/review`,
`subturtle://app/capture?text=…`. (Flutter drops the host, so `subturtle://bundles/x`
would lose "bundles".) Any link the app does not know opens Today. Universal links /
App Links on the dashboard domain need hosting files and are not set up yet.

## Google sign-in

The code uses `google_sign_in` 7 and sends the Google **access token** to
`/auth/google/access-token-login`. To turn it on:

1. Create iOS and Android OAuth clients in the Google Cloud project of the
   backend (Android needs the app's SHA-1).
2. Add both client ids to the server's `GOOGLE_OAUTH_CLIENT_ID_EXTENSION`
   (comma-separated) in each environment.
3. iOS: add the reversed iOS client id as a URL scheme in `ios/Runner/Info.plist`.
4. Build with `--dart-define=GOOGLE_SERVER_CLIENT_ID=… --dart-define=GOOGLE_IOS_CLIENT_ID=…`.

## Voice

The voice screen talks to Gemini Live directly, like the web:

1. `request-gemini-live-session-ephemeral-token` → a single-use token (open within 60 s).
2. `create-live-session-record` → the session id.
3. A WebSocket to the v1alpha `BidiGenerateContentConstrained` endpoint with
   `access_token=<token>`, then a `setup` message (audio out, voice, prompt,
   tools, transcription, resumption, sliding window). Code:
   `features/live_session/gemini_live_client.dart`.
4. Mic: `record`, 16 kHz mono PCM16. Speaker: `flutter_pcm_sound`, 24 kHz mono PCM16.
5. Transcript lines → `update-live-session-record {dialogs}`; usage →
   `{partialUsage, totalUsage}`; end → `debit-voice-minutes`.

What is **not verified**: it was not run against the real Gemini service (no
sign-in to dev or prod was allowed in this task). The message format is tested
with fakes. Things to check on a real phone: the WebSocket URL and setup are
accepted, audio session sharing between `record` and `flutter_pcm_sound` on
iOS (echo, Bluetooth), and phone-call interruptions (the spec asks to pause and
show "Resume"; today the session would keep running or drop and offer "Try again").
Lock-screen controls are not built.

## Design-system gaps

Kept the DS tokens as they are; listing what the phone shows:

- **Contrast**: white on rose-500 is about 3.9:1, white on jade-500 about 2.7:1,
  and text-muted on paper about 3.8:1. All are under 4.5:1 for normal text. On
  phones (sun, small text) the DS could use rose-600 for filled buttons and
  ink-600 for muted text.
- **No mobile parts in the DS yet**: tab bar, bottom sheet and FAB were built
  in `subturtle_ui` from the tokens and `mobile.css`. They should move into the DS.
- **Toast in dark mode** (see Decisions 9).
- **Avatar / Tag / Badge** sizes are web sizes; the kit pads tap areas to 48 dp
  without changing the visible size.

## Accessibility

- Every icon-only button has a label ("Play pronunciation", "Undo last answer", "End review", "More options").
- Cards that act as buttons have one label; the review card has custom actions
  (Show answer, Mark learned, Mark forgot, Undo), so swipes are never needed.
- Text follows the phone's size up to 200%; the tab bar labels stop at 150%;
  side-by-side task buttons stack at 150%+. A test checks Today at 200%.
- L1 text (`StL1Text`) is RTL only when the learner's language is RTL, with
  Vazirmatn and a taller line height. The rest of the app stays LTR.
- Reduced motion: no flip, no pulse, no shimmer, no fly-out.
- Haptics follow the spec and can be turned off in Me.
