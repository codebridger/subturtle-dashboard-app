import type { ReviewResult } from '~/types/language.type';

/**
 * The three-way fill-the-gap result (Q4, B-18), checked on the client.
 *
 * The server's `check-cloze-answer` is the judge when it is there; this is the same rule set
 * for when it is not (today's server, or a phrase with several blanks, which that function does
 * not take). Keep the two in step:
 *
 *   right — the expected text or an accepted answer, ignoring case, spacing and end punctuation.
 *           German ß = ss and ä/ö/ü = ae/oe/ue count as right: they are accepted spellings.
 *   close — "almost": only the accents are missing (Spanish, French, Italian, Swedish,
 *           Lithuanian), or the right word with the wrong ending (same lemma stem).
 *   wrong — anything else.
 */

export type ClozeReason = 'exact' | 'accent' | 'ending' | 'typo' | 'none';

/**
 * The server's reason (`check-cloze-answer` → `reason`, server/src/languages/answer-check.ts)
 * in the client's terms: what the "Almost" line says.
 */
export function reasonFromServer(reason: string | undefined, result: ReviewResult): ClozeReason {
    if (result === 'right') return 'exact';
    if (result === 'wrong') return 'none';
    if (reason === 'accent') return 'accent';
    if (reason === 'typo') return 'typo';
    return 'ending';
}

export interface ClozeGrade {
    result: ReviewResult;
    reason: ClozeReason;
}

/** Lowercase, collapse spaces, drop surrounding punctuation and quotes. */
export function normalizeAnswer(value: string): string {
    return (value || '')
        .toLowerCase()
        .replace(/[’‘`]/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[\s"'¡¿.,;:!?()«»„“”-]+|[\s"'.,;:!?()«»„“”-]+$/g, '');
}

/** Without accents: "café" → "cafe", "ąžuolas" → "azuolas". */
export function stripAccents(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '');
}

/** German spelling equivalents: ß ↔ ss, ä ↔ ae, ö ↔ oe, ü ↔ ue. */
function germanFold(value: string): string {
    return value.replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
}

function commonPrefix(a: string, b: string): number {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
}

export function gradeClozeAnswer(
    typed: string,
    expected: string,
    opts: { acceptedAnswers?: string[]; lemma?: string; language?: string | null } = {}
): ClozeGrade {
    const answer = normalizeAnswer(typed);
    if (!answer) return { result: 'wrong', reason: 'none' };

    const targets = [expected, ...(opts.acceptedAnswers ?? [])].map(normalizeAnswer).filter(Boolean);
    if (targets.includes(answer)) return { result: 'right', reason: 'exact' };

    if (opts.language === 'de' && targets.some((t) => germanFold(t) === germanFold(answer))) {
        return { result: 'right', reason: 'exact' };
    }

    // Only the accents differ: almost, with the right form shown.
    const bare = stripAccents(answer);
    if (targets.some((t) => stripAccents(t) === bare)) return { result: 'close', reason: 'accent' };

    // The right word with the wrong ending (Q4: "right verb, check the ending"): it shares the
    // lemma's stem, or most of the expected word (a German participle "gegangen" shares nothing
    // with "gehen" but "ge-gang-"). Short words have no room for an ending: exact only.
    const lemma = stripAccents(normalizeAnswer(opts.lemma ?? ''));
    const target = stripAccents(targets[0] ?? '');
    if (lemma.length >= 4) {
        const need = Math.max(3, lemma.length - 2);
        if (commonPrefix(bare, lemma) >= need && commonPrefix(target, lemma) >= need) return { result: 'close', reason: 'ending' };
    }
    if (target.length >= 5) {
        const need = target.length - 2;
        if (commonPrefix(bare, target) >= need && Math.abs(bare.length - target.length) <= 3) return { result: 'close', reason: 'ending' };
    }

    return { result: 'wrong', reason: 'none' };
}

/** The card's result over several blanks: the weakest one (any wrong → wrong, any close → close). */
export function combineResults(results: ReviewResult[]): ReviewResult | null {
    if (!results.length) return null;
    if (results.includes('wrong')) return 'wrong';
    if (results.includes('close')) return 'close';
    return 'right';
}
