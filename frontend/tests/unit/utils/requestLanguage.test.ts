import { describe, it, expect } from 'vitest';
import { prepareRequestLanguage, type RequestLanguageContext } from '~/utils/requestLanguage';

const names: Record<string, string> = { fa: 'Persian', tr: 'Turkish', de: 'German', en: 'English' };
const ctx = (over: Partial<RequestLanguageContext> = {}): RequestLanguageContext => ({
    enabled: true,
    activeLanguage: 'en',
    ownLanguage: 'fa',
    languages: [
        { code: 'en', status: 'active', explanationLanguage: 'fa' },
        { code: 'de', status: 'active', explanationLanguage: 'tr' },
        { code: 'es', status: 'paused', explanationLanguage: 'fa' },
    ],
    nameOf: (c) => names[c ?? ''] ?? String(c),
    ...over,
});
const base = { aiCharacter: 'Kore', source: { phraseIds: ['p1'] } };

describe('prepareRequestLanguage (D-16, Practice now)', () => {
    it('switches to the phrase language and explains in that language’s choice', () => {
        const { request, switchTo } = prepareRequestLanguage({ ...base, language: 'de' }, ctx());
        expect(switchTo).toBe('de');
        expect(request).toMatchObject({ language: 'de', explanationLanguage: 'tr', nativeLanguage: 'Turkish' });
    });

    it('reads the plain ?language= parameter too', () => {
        expect(prepareRequestLanguage({ ...base }, ctx(), 'de').switchTo).toBe('de');
    });

    it('stays on the active language for a language the learner does not study (or paused)', () => {
        expect(prepareRequestLanguage({ ...base, language: 'it' }, ctx()).switchTo).toBeNull();
        const { request, switchTo } = prepareRequestLanguage({ ...base, language: 'es' }, ctx());
        expect(switchTo).toBeNull();
        expect(request).toMatchObject({ language: 'en', explanationLanguage: 'fa' });
    });

    it('does not switch when the language is already active, and keeps a chosen explanation', () => {
        const { request, switchTo } = prepareRequestLanguage({ ...base, language: 'en', explanationLanguage: 'tr', nativeLanguage: 'Turkish' }, ctx());
        expect(switchTo).toBeNull();
        expect(request.explanationLanguage).toBe('tr');
    });

    it('leaves the request alone while multilingual is off', () => {
        const req = { ...base, language: 'de' };
        expect(prepareRequestLanguage(req, ctx({ enabled: false }))).toEqual({ request: req, switchTo: null });
    });
});
