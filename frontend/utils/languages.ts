/**
 * The one language list of the dashboard (D-09). It replaces three lists that disagreed:
 * `utils/language.ts` (Arabic mapped to `ae`), `utils/languages.static.ts` (Hebrew coded as
 * `"he or iw"`) and the app store's `languageList` (no Persian).
 *
 * Codes are ISO 639-1, the same codes and names as the server's list
 * (`server/src/languages/list.ts`, B-01). A few languages (`ceb`, `haw`, `hmn`, `ckb`) have no
 * 639-1 code and keep their 639-2/3 code, as on the server. The server's `get-language-capabilities` is the source of truth for which
 * languages can be LEARNED and which own languages the Coach explains in; this list only
 * names, normalises and orients them, so it may safely know more languages than the server.
 *
 * Values arrive in several shapes: the extension stores display names ("Spanish") in
 * `language_info` / `translation_language`, newer paths store codes, and old pickers stored
 * titles with qualifiers ("Portuguese (Portugal, Brazil)"). `toCode` accepts all of them.
 */

export interface LanguageInfo {
    /** ISO 639-1 code ("fa"); a Google code where 639-1 has none. */
    code: string;
    /** English name, used on the pill and as the stored title ("Persian"). */
    name: string;
    /** The language's own name ("فارسی"). Equal to `name` when we do not know better. */
    nativeName: string;
    /** Written right to left. */
    rtl?: boolean;
}

export const LANGUAGES: readonly LanguageInfo[] = [
    { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
    { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
    { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
    { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
    { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycanca' },
    { code: 'eu', name: 'Basque', nativeName: 'Euskara' },
    { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
    { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski' },
    { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
    { code: 'ca', name: 'Catalan', nativeName: 'Català' },
    { code: 'ceb', name: 'Cebuano', nativeName: 'Cebuano' },
    { code: 'zh', name: 'Chinese', nativeName: '中文' },
    { code: 'co', name: 'Corsican', nativeName: 'Corsu' },
    { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
    { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
    { code: 'da', name: 'Danish', nativeName: 'Dansk' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto' },
    { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
    { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    { code: 'fy', name: 'Frisian', nativeName: 'Frysk' },
    { code: 'gl', name: 'Galician', nativeName: 'Galego' },
    { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
    { code: 'de', name: 'German', nativeName: 'Deutsch' },
    { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
    { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl ayisyen' },
    { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
    { code: 'haw', name: 'Hawaiian', nativeName: 'ʻŌlelo Hawaiʻi' },
    { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
    { code: 'hmn', name: 'Hmong', nativeName: 'Hmoob' },
    { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
    { code: 'is', name: 'Icelandic', nativeName: 'Íslenska' },
    { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
    { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
    { code: 'ga', name: 'Irish', nativeName: 'Gaeilge' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語' },
    { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
    { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша' },
    { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ' },
    { code: 'rw', name: 'Kinyarwanda', nativeName: 'Kinyarwanda' },
    { code: 'ko', name: 'Korean', nativeName: '한국어' },
    { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî' },
    { code: 'ckb', name: 'Kurdish (Sorani)', nativeName: 'کوردی', rtl: true },
    { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча' },
    { code: 'lo', name: 'Lao', nativeName: 'ລາວ' },
    { code: 'la', name: 'Latin', nativeName: 'Latina' },
    { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
    { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
    { code: 'lb', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch' },
    { code: 'mk', name: 'Macedonian', nativeName: 'Македонски' },
    { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy' },
    { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
    { code: 'mt', name: 'Maltese', nativeName: 'Malti' },
    { code: 'mi', name: 'Maori', nativeName: 'Māori' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
    { code: 'mn', name: 'Mongolian', nativeName: 'Монгол' },
    { code: 'my', name: 'Myanmar (Burmese)', nativeName: 'မြန်မာ' },
    { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
    { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
    { code: 'ny', name: 'Nyanja (Chichewa)', nativeName: 'Chichewa' },
    { code: 'or', name: 'Odia (Oriya)', nativeName: 'ଓଡ଼ିଆ' },
    { code: 'ps', name: 'Pashto', nativeName: 'پښتو', rtl: true },
    { code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true },
    { code: 'pl', name: 'Polish', nativeName: 'Polski' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
    { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
    { code: 'ro', name: 'Romanian', nativeName: 'Română' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский' },
    { code: 'sm', name: 'Samoan', nativeName: 'Gagana Sāmoa' },
    { code: 'gd', name: 'Scots Gaelic', nativeName: 'Gàidhlig' },
    { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
    { code: 'st', name: 'Sesotho', nativeName: 'Sesotho' },
    { code: 'sn', name: 'Shona', nativeName: 'chiShona' },
    { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', rtl: true },
    { code: 'si', name: 'Sinhala (Sinhalese)', nativeName: 'සිංහල' },
    { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
    { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
    { code: 'so', name: 'Somali', nativeName: 'Soomaali' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'su', name: 'Sundanese', nativeName: 'Basa Sunda' },
    { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
    { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
    { code: 'tl', name: 'Tagalog (Filipino)', nativeName: 'Tagalog' },
    { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
    { code: 'tt', name: 'Tatar', nativeName: 'Татарча' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
    { code: 'th', name: 'Thai', nativeName: 'ไทย' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
    { code: 'tk', name: 'Turkmen', nativeName: 'Türkmençe' },
    { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true },
    { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە', rtl: true },
    { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbekcha' },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
    { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg' },
    { code: 'xh', name: 'Xhosa', nativeName: 'isiXhosa' },
    { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש', rtl: true },
    { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
    { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code.toLowerCase(), l]));
const BY_NAME = new Map(LANGUAGES.map((l) => [l.name.toLowerCase(), l]));

/**
 * Names and codes seen in stored data that do not match the list directly: retired ISO codes
 * (`iw`, `in`, `ji`), the old pickers' qualified titles, and region tags we fold into the
 * base language. Values are list codes.
 */
const ALIASES: Record<string, string> = {
    // The old dashboard list stored Arabic as "ae".
    ae: 'ar',
    iw: 'he',
    in: 'id',
    ji: 'yi',
    farsi: 'fa',
    dari: 'fa',
    bangla: 'bn',
    nb: 'no',
    nn: 'no',
    bokmal: 'no',
    castilian: 'es',
    flemish: 'nl',
    fil: 'tl',
    mandarin: 'zh',
    filipino: 'tl',
    tagalog: 'tl',
    burmese: 'my',
    chichewa: 'ny',
    oriya: 'or',
    sinhalese: 'si',
    sinhala: 'si',
    sorani: 'ckb',
    'portuguese (portugal, brazil)': 'pt',
    'brazilian portuguese': 'pt',
    'chinese (simplified)': 'zh',
    'chinese (traditional)': 'zh',
    'zh-hans': 'zh',
    'zh-hant': 'zh',
    'scottish gaelic': 'gd',
    'he or iw': 'he',
};

/**
 * Normalise a stored language value to a list code: "Persian", "fa", "FA", "fa-IR", "iw" and
 * "Portuguese (Portugal, Brazil)" all resolve. Returns undefined for "auto", "unknown", an
 * empty value or anything we do not know — a wrong language is worse than none.
 */
export function toCode(value?: string | null): string | undefined {
    if (!value) return undefined;
    const raw = String(value).trim();
    const lower = raw.toLowerCase();
    if (!lower || lower === 'auto' || lower === 'unknown') return undefined;

    const exact = BY_CODE.get(lower) ?? BY_NAME.get(lower);
    if (exact) return exact.code;
    if (ALIASES[lower]) return ALIASES[lower];

    // A region tag ("fa-IR", "pt_BR") folds into the base language.
    const base = lower.split(/[-_]/)[0];
    if (base !== lower) {
        const hit = BY_CODE.get(base) ?? (ALIASES[base] ? BY_CODE.get(ALIASES[base]) : undefined);
        if (hit) return hit.code;
    }
    return undefined;
}

/** The list entry for any stored value, or undefined. */
export function languageInfo(value?: string | null): LanguageInfo | undefined {
    const code = toCode(value);
    return code ? BY_CODE.get(code.toLowerCase()) : undefined;
}

/** English name ("Persian"). Falls back to the value itself so nothing renders blank. */
export function languageName(value?: string | null): string {
    return languageInfo(value)?.name ?? (value ? String(value) : '');
}

/** The language's own name ("فارسی"), falling back to the English name. */
export function nativeLanguageName(value?: string | null): string {
    const info = languageInfo(value);
    return info?.nativeName ?? languageName(value);
}

/**
 * The picker label (Q13): "German · Deutsch". When the native name is the English name
 * ("English") only one is shown.
 */
export function pickerLabel(value?: string | null, nativeOverride?: string): string {
    const name = languageName(value);
    const native = nativeOverride ?? nativeLanguageName(value);
    return native && native !== name ? `${name} · ${native}` : name;
}

/** Written right to left (Persian, Arabic, Hebrew, Urdu, ...). */
export function isRtl(value?: string | null): boolean {
    return !!languageInfo(value)?.rtl;
}

/**
 * The two-letter chip on bundle covers and pills ("FA"). The old `short()` cut the English
 * title, so "Persian" became "PE"; this goes through the code instead. Unknown → ''.
 */
export function shortCode(value?: string | null): string {
    const code = toCode(value);
    return code ? code.toUpperCase() : '';
}

/** Letters of the right-to-left scripts our own languages use (Hebrew, Arabic, Syriac, Thaana, N'Ko and their presentation forms). */
const RTL_LETTER = /[֐-߿ࡠ-ࣿיִ-﷿ﹰ-﻿]/;

/**
 * The language to mark a run of text with, when it should be in `code` but may not be: the
 * chat test's fixed questions carry English help even for a Persian speaker. A right-to-left
 * code on text with no right-to-left letter would flip its punctuation ("?What is your name"),
 * so that text gets no language and the browser picks its direction (`dir="auto"`).
 */
export function runLanguage(text: string | null | undefined, code: string | null | undefined): string | null {
    if (!code) return null;
    if (isRtl(code) && !RTL_LETTER.test(text ?? '')) return null;
    return code;
}
