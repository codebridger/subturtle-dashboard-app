# Starter packs: AI review report (C-01, with C-03 and C-04 in AI form)

**Date:** 2026-10-16. **Status:** AI-checked only. **No human teacher or native speaker has
read these packs yet.** Every number below comes from AI reviewers. The work list asks for
native-speaker review (C-01), a teacher translation gate (C-03) and a teacher cloze gate
(C-04). Navid decided that for now AI builds and checks the content, and teachers come later.
Treat this report as the input for that later human review, not as a replacement for it.

## What is in this folder

| File | What it is |
| --- | --- |
| `en.json` `es.json` `de.json` `fr.json` `it.json` `sv.json` `lt.json` | One pack per learning language: 150 A1 survival chunks in 10 groups (greetings, polite, questions, needs, time, places, food, travel, work, feelings), band 1–3. |
| `starter-pack.schema.json` | JSON schema for a pack. |
| `__tests__/starter-packs.test.ts` | Jest test that validates every pack (see "Checks in code"). |
| `reviews/<lang>.json` | Every AI review finding per language, round by round, with the fix that was applied. |

**Same concepts everywhere.** All seven packs cover the same 150 concepts. An id is
`<lang>-<group>-<nn>`, and `<group>-<nn>` means the same thing in every language (for
example, `*-food-07` is "Enjoy your meal!"). The wording is what a native speaker really says,
not a word-for-word copy. For example, German has `Guten Appetit!`, Swedish `Smaklig måltid!`
and English `Enjoy!`. `note` gives the other register, the feminine form, or the other regional
variant.

**Translations.** Each item has translations into the six checked own languages: fa, ar, es,
vi, en and tr, minus the pack's own language. Persian uses Persian ی/ک and the zero-width
non-joiner. Arabic is Modern Standard Arabic. Both have no Latin letters, and the test checks
this.

## How the review worked

1. **Write.** One AI author agent wrote each pack from the shared concept list and a fixed set
   of rules:
   - Use natural chunks.
   - Use the informal form for social chat and the polite form for service situations.
   - Use the masculine form by default and give the feminine in `note`.
   - Pick one cloze word per item, with the `lemma` as the cue.
2. **Review (round 1).** A separate AI reviewer per language, which did not write the pack,
   checked every item as a strict native-speaker teacher. It checked:
   - the text (correct, natural, A1 level, register);
   - the note;
   - the cloze card (C-04: does the blanked word have exactly one defensible answer?);
   - every translation (C-03).
3. **Fix.** The lead session applied every error fix and most doubt fixes.
4. **Re-check (round 2, round 3 for de, es and it).** The same reviewer re-read every changed
   item and did a second strict sweep of all 150.
5. **Cross-pack consistency.** When a reviewer fixed a translation, the lead session copied
   the fix to the same concept in the other packs if the old translation was identical there.
   Examples: Vietnamese asks for a phone number with *là bao nhiêu*, and Arabic *من ذلك؟* is
   used for "Who's that?". These 27 copied fixes were checked by a separate AI agent.

**Two rules came out of round 1 and were applied to every pack:**

- **Gendered cloze words.** A blank on a word that changes with gender (*cansado/cansada*,
  *Student/Studentin*, *pavargęs/pavargusi*, *aperto/aperta*) marks a female learner's correct
  answer wrong. Each blank like this was moved to a word that does not change (usually the verb:
  *Estoy*, *Sono*, *suis*, *bin*) or dropped.
- **Register.** The same applies to tu/usted, du/Sie and similar forms when nothing on the
  card fixes the register. A pronoun in the sentence (*Wo ___ du?*) fixes it, so those blanks
  are kept.

## Results per language

"Clean" means the reviewer found no error and no doubt in any field of the item: text, note,
cloze or any of the 5–6 translations.

| Language | Items checked | Items with an error (all rounds) | Errors fixed | Final clean | Final pass rate | Doubtful items left |
| --- | --- | --- | --- | --- | --- | --- |
| English (en) | 150 | 1 | 1 | 150 | 100% | — |
| Spanish (es) | 150 | 20 | 20 | 148 | 98.7% | `es-questions-15`, `es-feelings-11` |
| German (de) | 150 | 7 | 7 | 145 | 96.7% | `de-greetings-12`, `de-questions-05`, `de-questions-06`, `de-questions-14`, `de-travel-14` |
| French (fr) | 150 | 14 | 14 | 150¹ | 100%¹ | — |
| Italian (it) | 150 | 20 | 20 | 149 | 99.3% | `it-feelings-11` |
| Swedish (sv) | 150 | 7 | 7 | 149¹ | 99.3%¹ | `sv-places-08` |
| Lithuanian (lt) | 150 | 18 | 18 | 148¹ | 98.7%¹ | `lt-needs-09`, `lt-food-13` |

¹ In the last re-check the reviewer confirmed 146 (fr), 145 (sv) and 145 (lt) items as clean.
It also gave fixes for the remaining errors and doubts. Those last fixes (4 in fr, 4 in sv and
3 in lt) were applied but not read again. The final figure assumes they are correct.

**Target met:** every pack is at least 95% clean after fixes (lowest: German, 96.7%).

### Where the errors were

| Language | Translation errors / doubts | Cloze errors / doubts | Text or note errors / doubts |
| --- | --- | --- | --- |
| en | 0 / 10 | 0 / 0 | 1 / 0 |
| es | 2 / 2 | 17 / 4 | 1 / 1 |
| de | 2 / 5 | 5 / 6 | 0 / 2 |
| fr | 3 / 4 | 11 / 0 | 0 / 2 |
| it | 5 / 7 | 15 / 1 | 0 / 2 |
| sv | 2 / 3 | 4 / 0 | 1 / 2 |
| lt | 4 / 2 | 14 / 2 | 0 / 1 |

The 27 cross-pack consistency fixes are not counted in this table.

Most errors were in cloze cards, not in the language itself. In five of the seven packs the
reviewers found no error in the chunks themselves; the few text errors were:

- Swedish word order: *Jag gillar det inte.*
- An English variant choice: *Which track?* for American English.
- A Spanish register choice: *Quisiera este*.

### C-03 in AI form: translations

Every translation was read in round 1, and again in the round-2 sweep. Round 1 found these
errors, out of 900 strings per pack (750 for en and es): en 0, es 2, de 0, fr 1, it 0, sv 0,
lt 1. The deeper round-2 sweeps found a few more, mostly Vietnamese calques ("của tôi",
"là gì" for a number) and colloquial Arabic (مبروك, سفري). All were fixed and copied across
the packs. The AI estimate is far above the 90% gate.

The other half of C-03 is not covered here. That half is a teacher rating 20 Coach turns per
language, and these packs contain no Coach turns.

### C-04 in AI form: cloze cards

| | en | es | de | fr | it | sv | lt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cloze cards (before review) | 127 | 130 | 132 | 132 | 121 | 129 | 120 |
| Exactly one defensible answer, before fixes | 127 (100%) | 116 (89%) | 130 (98%) | 121 (92%) | 106 (88%) | 125 (97%) | 106 (88%) |
| Cloze cards now | 127 | 128 | 131 | 131 | 116 | 125 | 111 |

After the fixes, the reviewers found no cloze card with a second valid answer. The only cloze
cards still marked doubtful are these:

- de: the five du/Sie verbs. The pronoun on the card decides the answer, so the lead kept them.
- es and it: `feelings-11`, "I miss you". A learner could read it as past tense, or with a
  plural "you".
- lt: `needs-09`, where a participle could also be accepted.

The C-04 gate also asks that fewer than 3% of valid answers be rejected. The fix for that is to
accept more answers, not to change the card. The `acceptedAnswers` list that will do this belongs
to B-15/B-18 and is not in these packs.

## Checks in code

`__tests__/starter-packs.test.ts` runs in the normal server Jest suite. It checks:

- the schema shape, 150–200 items per pack, and the same concept keys in every pack;
- unique ids and unique texts;
- 8 to 12 groups, each used at least once, and every band 1–3 used;
- that the translation keys are exactly the six own languages minus the pack's own, with none
  empty;
- that fa and ar are in Arabic script, with no Latin letters;
- that `lemma` and `form` come together, and that `form` occurs exactly once as a whole word
  and is the first case-insensitive match in `text`. That first match is the place the
  frontend cloze builder (`useClozeBlanks`) blanks.

## Known limits

- **No human has checked any of this.** AI reviewers can share blind spots with AI authors,
  especially in Lithuanian and in Persian and Arabic register. The doubtful items above and the
  `reviews/` files are a good place for a teacher to start.
- **Choice of variety:**
  - English is American, with the British form in `note`.
  - Spanish is neutral and mixes forms that are understood everywhere. For example, it uses
    *boleto* and *Todo recto*, with the other variety in `note`.
  - Arabic is Modern Standard Arabic, not a dialect.
- **Vietnamese "I love you"** (`*-feelings-03`) uses *Anh yêu em*, which assumes a man speaking
  to a woman. Vietnamese has no natural neutral form.
- **No audio yet.** `audioUrl` belongs to B-22.
