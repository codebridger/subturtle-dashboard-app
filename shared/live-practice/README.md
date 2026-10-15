# Live practice coach spec

`spec.json` is the one source for the AI coach used by live practice sessions
(voice and text) on the web and in the mobile app:

- `instructionsTemplate`, `phraseLine`, `nativeLanguage`: the system prompt.
- `tools`: the `activate_phrase` / `finish_practice` declarations.
- `messages`: hidden messages sent to the model (welcome, card selected, tool errors).
- `rules`: behaviour both apps follow (mic starts muted, when a phrase counts as
  practised, single-phrase start, goodbye delay after `finish_practice`).

## Who reads it

| App | How |
| --- | --- |
| Web | `frontend/utils/livePractice.ts` imports the file. The voice and text stores and pages use its helpers. |
| Mobile | `mobile/packages/subturtle_api/tool/gen_live_practice.dart` embeds it in `lib/src/coach/live_practice_spec.g.dart`; `CoachPractice` and the voice / text controllers read it through `LivePracticeSpec`. |

## Changing it

1. Edit `spec.json`.
2. Regenerate the mobile copy: `cd mobile/packages/subturtle_api && dart run tool/gen_live_practice.dart`.
3. If you change a rule, change both apps' code that follows it.

`frontend/tests/unit/utils/liveCoachSpec.test.ts` (runs in CI) and
`mobile/packages/subturtle_api/test/live_practice_spec_test.dart` fail while the
mobile copy is stale or an app builds a prompt, tool or message on its own.
