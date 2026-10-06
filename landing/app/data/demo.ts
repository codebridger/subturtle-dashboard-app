/**
 * The hero demo's two stories, in the places the extension works: a subtitle line in an invented
 * show (never a real show, never YouTube or Netflix UI) and a sentence on an invented web page.
 * For each language: the meaning in that language, and the English pronunciation spelled in its
 * own alphabet, the way the extension shows them.
 */
export interface DemoLanguage {
    code: string;
    /** English name, for "In Turkish". */
    name: string;
    /** The language's own name, on its chip. */
    native: string;
    dir: 'ltr' | 'rtl';
}

export const DEMO_LANGUAGES: DemoLanguage[] = [
    { code: 'tr', name: 'Turkish', native: 'Türkçe', dir: 'ltr' },
    { code: 'fa', name: 'Persian', native: 'فارسی', dir: 'rtl' },
    { code: 'es', name: 'Spanish', native: 'Español', dir: 'ltr' },
    { code: 'ru', name: 'Russian', native: 'Русский', dir: 'ltr' },
    { code: 'ko', name: 'Korean', native: '한국어', dir: 'ltr' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr' },
    { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl' },
];

/** The language the demo opens in, and the one the illustrations below it use. */
export const DEFAULT_LANGUAGE = DEMO_LANGUAGES.find((l) => l.code === 'es')!;

export interface DemoStory {
    /** Where it was found: the show, or the page. */
    source: string;
    /** The full line, word by word. */
    words: readonly string[];
    /** Index range of the phrase inside `words`. */
    chunk: readonly [number, number];
    phrase: string;
    gloss: string;
    /** What the Save button says once saved: the context that travels with the phrase. */
    savedLabel: string;
    byLanguage: Record<string, { meaning: string; say: string }>;
}

export const VIDEO_STORY: DemoStory = {
    source: 'Rooftop Nights · S1E4',
    words: ['Honestly,', 'I’m', 'still', 'on', 'the', 'fence', 'about', 'it.'],
    chunk: [3, 5],
    phrase: 'on the fence',
    gloss: 'not decided yet',
    savedLabel: 'Saved with its scene',
    byLanguage: {
        tr: { meaning: 'kararsız', say: 'on dı fens' },
        fa: { meaning: 'دودل', say: 'آن دِ فِنس' },
        es: { meaning: 'indeciso', say: 'on de fens' },
        ru: { meaning: 'в раздумьях', say: 'он зэ фэнс' },
        ko: { meaning: '망설이는', say: '온 더 펜스' },
        hi: { meaning: 'दुविधा में', say: 'ऑन द फ़ेंस' },
        ar: { meaning: 'متردد', say: 'أون ذَ فِنس' },
    },
};

export const PAGE_STORY: DemoStory = {
    source: 'The Weekly Byte',
    words: ['Shipping', 'in', 'one', 'week', 'felt', 'like', 'a', 'long', 'shot', 'to', 'all', 'of', 'us,', 'but', 'we', 'made', 'it.'],
    chunk: [6, 8],
    phrase: 'a long shot',
    gloss: 'unlikely to work',
    savedLabel: 'Saved with its paragraph',
    byLanguage: {
        tr: { meaning: 'zayıf ihtimal', say: 'ı long şat' },
        fa: { meaning: 'بعید', say: 'اِ لانگ شات' },
        es: { meaning: 'poco probable', say: 'a long shat' },
        ru: { meaning: 'маловероятно', say: 'э лонг шот' },
        ko: { meaning: '가능성이 희박한 일', say: '어 롱 샷' },
        hi: { meaning: 'कम संभावना', say: 'अ लॉन्ग शॉट' },
        ar: { meaning: 'احتمال ضعيف', say: 'أ لونغ شوت' },
    },
};
