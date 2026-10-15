/**
 * Which language the learning RPCs are scoped to (multilingual-api.md, section 3: "Always send
 * `language` on the functions in section 3").
 *
 * A plain module, not the store: the Leitner, Pool, bundle and Coach stores import it, and the
 * language store imports them to reset them on a switch, so going through Pinia here would make
 * an import cycle. The language store is the only writer.
 *
 * While multilingual is off (the server has not answered `get-language-capabilities`), nothing
 * is added, so every request is byte-for-byte what today's dashboard sends.
 */

let scope: { enabled: boolean; language: string | null } = { enabled: false, language: null };

export function setLanguageScope(enabled: boolean, language: string | null) {
    scope = { enabled, language };
}

/** The active language, or null while multilingual is off. */
export function scopedLanguage(): string | null {
    return scope.enabled ? scope.language : null;
}

/** `args` plus `language` when multilingual is on. Never overrides a language the caller set. */
export function withLanguage<T extends Record<string, any>>(args: T): T & { language?: string } {
    const language = scopedLanguage();
    if (!language || args.language) return args;
    return { ...args, language };
}
