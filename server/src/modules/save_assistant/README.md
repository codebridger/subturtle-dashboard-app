# save_assistant

Stores the conversations of the mobile "Save a phrase" assistant. The server
owns the history: the client sends only the new message, or the phrase it
picked. Translation work reuses `getDetailedTranslation` and
`getTranslationAdvice` from `../translation/service.ts`.

Spec: `subturtle-docs` → `docs/tech/save-assistant-backend.md`.

## Calling a function

All functions are `user_access`. Call them with `functionProvider.run` and
send the signed-in user's id as `userId`. The server checks it against the
token, and every function refuses a call without it.

```ts
const { sessionId, candidates, translation } = await functionProvider.run({
  name: 'createSaveSession',
  args: {
    userId,
    message: 'I had to get out of the house quickly',
    targetLanguage: 'fa',
    source: { kind: 'share', app: 'YouTube' },
  },
});
```

## Functions

### `createSaveSession`

- **In**: `{ message, translationLanguage, sourceLanguage?, language?, source? }`
  - `translationLanguage`: the learner's own language. The old name
    `targetLanguage` still works; each request that uses it is counted in
    `cms.legacy_usage` (B-17).
  - `language`: the learning language to save into. Missing: the detected
    language if the learner has it, then the active language (B-16).
  - `sourceLanguage` empty or `"auto"` lets the model detect it.
  - `source`: `{ kind: "share" | "paste" | "typed", app?, pageUrl?, pageTitle? }`.
- **Does**: translates the whole message; stores the user message and an
  assistant `translation` message; bills the AI call.
- **Out**: `{ sessionId, candidates, translation, messageId, detectedLanguage, language, inProfile }`
  - `detectedLanguage`: what the model found (`"unknown"` when unsure);
    `language`: where the session saves; `inProfile`: the learner has the
    detected language.
  - `candidates`: `[{ text, type }]`. The first one is the whole message
    (`type: "full"`); the rest are the translation's chunks.
  - `translation`: the same shape `translateWithContext` returns for
    `translationType: "detailed"`.

### `saveSessionTurn`

- **In**: `{ sessionId, pick }` **or** `{ sessionId, message }`. Send exactly one.
- **pick**: the text of one of the session's `candidates`. Returns its
  translation. If this session already translated that phrase, the stored one
  is reused, with no AI call and no charge.
  - **Out**: `{ translation, messageId, cached, wrapUp, detectedLanguage }`
- **message**: a follow-up question. The assistant answers about the phrase
  whose translation was shown last, using the stored history.
  - **Out**: `{ reply, messageId, wrapUp, detectedLanguage, candidates? }`. `candidates` is
    present only when the answer added new phrase options.
- `wrapUp` turns `true` a few messages before the per-session cap.

### `attachSavedPhrase`

Call this after `createPhrase` succeeds, to link the saved phrase to the
conversation.

- **In**: `{ sessionId, phraseId, bundleId? }`. Without `bundleId`, the
  server looks up a bundle of the user's that holds the phrase.
- **Does**: checks the phrase (and bundle) belong to the user; adds the
  phrase to the session and adds a `saved` message. Calling it twice for the
  same phrase changes nothing.
- **Out**: `{ attached: true, messageId, savedCount }` or
  `{ attached: false, savedCount }` when it was already attached.

### `listSaveSessions`

- **In**: `{ query?, onlySaved?, limit = 20, before?, language? }`
  - `language`: only that learning language's sessions (old sessions are English).
    Each row also carries `language`.
  - `query`: matches the title or any message text (case-insensitive).
  - `onlySaved`: only sessions with at least one saved phrase.
  - `limit`: 1 to 50.
  - `before`: a date (ISO string). To load the next page, send the last
    item's `lastMessageAt`.
- **Out**: `[{ sessionId, title, savedCount, savedPhrases, lastMessageAt }]`,
  newest first. `savedPhrases` holds the phrase texts. No messages.

### `getSaveSession`

- **In**: `{ sessionId }`
- **Out**: the full session: `{ sessionId, title, source, sourceLanguage,
  targetLanguage, translationLanguage, language, detectedLanguage, messages, candidates, savedPhraseIds, savedPhrases,
  savedCount, lastMessageAt, usage, createdAt, updatedAt }`.

Message shape: `{ id, role: "user" | "assistant", kind: "text" | "translation" | "saved", text?, payload?, createdAt }`.
- `translation`: `text` is the phrase; `payload` is its translation.
- `saved`: `payload` is `{ phraseId, phrase, bundleId? }`.
- A pick is stored as a user `text` message holding the picked phrase.

### `deleteSaveSession`

- **In**: `{ sessionId }` or `{ all: true }`
- **Out**: `{ deleted }` (the number of sessions removed). Saved phrases are
  kept; only the conversations go.

## Errors

| Error | When | What the app shows |
| --- | --- | --- |
| `AI_CREDIT_EXHAUSTED: …` | The month's AI budget is used up. Nothing is stored. | The normal limit card. |
| `TIER_LIMIT_REACHED: "text_chat_messages_per_chat" …` | The session hit its message cap. | Ask the user to start a new session. |
| `SAVE_ASSISTANT_UNAVAILABLE: …` | The AI provider failed. Nothing is stored or charged. | A "try again" message. |
| `Save session not found` | Wrong id, or another user's session. | — |

## How it works

- **Ownership.** Every query filters on `refId = userId`. Another user's
  session looks the same as a missing one.
- **Billing.** Each AI call checks the budget with `checkCreditAllocation`
  and is billed with `recordUsage` (`serviceType: "save_assistant"`). The
  translation service does not return token counts, so usage is **estimated**
  (about 4 characters per token, plus a fixed prompt cost) at the primary
  translation model's rates. See `config.ts`. A cached pick is free.
- **Failures.** The AI call runs before anything is written. If it fails, no
  message is stored and nothing is billed.
- **Message cap.** User messages per session are capped by the tier's
  text-chat message cap (`getTextChatMessageCap`), or 60 when the tier has no
  cap. Save-assistant sessions do not count against the monthly text-chat
  count.
- **Concurrent turns.** Turns use `$push` and `$inc`, so two turns at once do
  not overwrite each other.
- **Search.** A case-insensitive regex on `title` and `messages.text`, scoped
  to one user. There is no text index, because Firestore with MongoDB
  compatibility does not support one.
- **Retention.** Sessions expire 6 months after creation (TTL index), like
  `live_session_text`.
