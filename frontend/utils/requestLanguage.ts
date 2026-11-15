import type { LiveSessionRequest } from '~/types/live-session-request';
import { toCode } from '~/utils/languages';

/** The slice of the language store this needs (a plain object in tests). */
export interface RequestLanguageContext {
    enabled: boolean;
    activeLanguage: string;
    ownLanguage: string | null;
    languages: { code: string; status: string; explanationLanguage?: string }[];
    nameOf: (code?: string | null) => string;
}

/**
 * Where a live-session request should run (D-16, E-08). The extension's "Practice now" link
 * carries the saved phrase's `language`. When the learner studies that language and it is not
 * the active one, the session switches to it first (one active language, contract section 5).
 * "Coach explains in" is filled from that language's profile, else the own language, so the
 * server builds the Coach prompt for it.
 *
 * A language the learner does not have, an unknown code, or multilingual off: the request is
 * left as it is and the session runs as before.
 */
export function prepareRequestLanguage(
    request: LiveSessionRequest,
    ctx: RequestLanguageContext,
    queryLanguage?: string | null
): { request: LiveSessionRequest; switchTo: string | null } {
    if (!ctx.enabled) return { request, switchTo: null };

    const wanted = toCode(request.language ?? queryLanguage ?? undefined);
    const summary = wanted ? ctx.languages.find((l) => l.code === wanted && l.status === 'active') : undefined;
    const language = summary ? summary.code : ctx.activeLanguage;

    const next: LiveSessionRequest = { ...request, language };
    if (!next.explanationLanguage) {
        const explanation = summary?.explanationLanguage || ctx.languages.find((l) => l.code === language)?.explanationLanguage || ctx.ownLanguage;
        if (explanation) next.explanationLanguage = explanation;
    }
    // The client-side prompt (used when the server cannot build one) reads the English name.
    if ((!next.nativeLanguage || next.nativeLanguage === 'auto') && next.explanationLanguage) {
        next.nativeLanguage = ctx.nameOf(next.explanationLanguage);
    }

    return { request: next, switchTo: summary && summary.code !== ctx.activeLanguage ? summary.code : null };
}
