/**
 * Language values reach the client in two shapes: phrases saved by the extension store a
 * display name ("Spanish") in `language_info` / `translation_language`, while some paths
 * store an ISO code. Normalise both to the 2-letter code the UI shows on bundle covers, and
 * return undefined when neither matches rather than guessing — a wrong flag is worse than none.
 */
const NAME_TO_CODE: Record<string, string> = {
    chinese: 'zh',
    danish: 'da',
    english: 'en',
    french: 'fr',
    german: 'de',
    greek: 'el',
    hungarian: 'hu',
    italian: 'it',
    japanese: 'ja',
    polish: 'pl',
    portuguese: 'pt',
    russian: 'ru',
    spanish: 'es',
    swedish: 'sv',
    turkish: 'tr',
    arabic: 'ae',
};

export function toLanguageCode(value?: string): string | undefined {
    if (!value) return undefined;

    const trimmed = value.trim().toLowerCase();
    if (NAME_TO_CODE[trimmed]) return NAME_TO_CODE[trimmed].toUpperCase();
    if (/^[a-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();

    return undefined;
}
