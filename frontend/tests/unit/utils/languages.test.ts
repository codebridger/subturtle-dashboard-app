import { describe, it, expect } from 'vitest';
import { LANGUAGES, isRtl, languageName, nativeLanguageName, pickerLabel, runLanguage, shortCode, toCode } from '~/utils/languages';

describe('languages list (D-09)', () => {
    it('has one entry per code', () => {
        const codes = LANGUAGES.map((l) => l.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('fixes the old code bugs', () => {
        // Arabic was mapped to "ae", Hebrew coded as "he or iw", Persian missing.
        expect(toCode('Arabic')).toBe('ar');
        expect(toCode('Hebrew')).toBe('he');
        expect(toCode('he or iw')).toBe('he');
        expect(toCode('iw')).toBe('he');
        expect(toCode('Persian')).toBe('fa');
        expect(toCode('Farsi')).toBe('fa');
    });

    it('accepts names, codes, cases and region tags', () => {
        expect(toCode('Spanish')).toBe('es');
        expect(toCode('ES')).toBe('es');
        expect(toCode(' german ')).toBe('de');
        expect(toCode('fa-IR')).toBe('fa');
        expect(toCode('pt_BR')).toBe('pt');
        expect(toCode('Portuguese (Portugal, Brazil)')).toBe('pt');
        expect(toCode('zh-CN')).toBe('zh');
        expect(toCode('Chinese (Simplified)')).toBe('zh');
        // The old dashboard list stored Arabic as "ae"; read it back as Arabic.
        expect(toCode('ae')).toBe('ar');
    });

    it('returns undefined for auto, unknown and junk', () => {
        expect(toCode('auto')).toBeUndefined();
        expect(toCode('unknown')).toBeUndefined();
        expect(toCode('')).toBeUndefined();
        expect(toCode(undefined)).toBeUndefined();
        expect(toCode('Klingon')).toBeUndefined();
    });

    it('shortens through the code, so Persian is FA, not PE', () => {
        expect(shortCode('Persian')).toBe('FA');
        expect(shortCode('Arabic')).toBe('AR');
        expect(shortCode('zh-TW')).toBe('ZH');
        expect(shortCode('ckb')).toBe('CKB');
        expect(shortCode('Klingon')).toBe('');
    });

    it('names a language in English and natively', () => {
        expect(languageName('de')).toBe('German');
        expect(nativeLanguageName('de')).toBe('Deutsch');
        expect(pickerLabel('de')).toBe('German · Deutsch');
        // No doubled name when the two are the same.
        expect(pickerLabel('en')).toBe('English');
        // Unknown values still render something.
        expect(languageName('Klingon')).toBe('Klingon');
    });

    it('knows which languages are written right to left', () => {
        for (const code of ['fa', 'ar', 'he', 'ur', 'ps']) expect(isRtl(code)).toBe(true);
        for (const code of ['en', 'de', 'tr', 'lt']) expect(isRtl(code)).toBe(false);
        expect(isRtl('Persian')).toBe(true);
    });
});

describe('runLanguage (right-to-left runs only for right-to-left text)', () => {
    it('keeps the own language for text written in it', () => {
        expect(runLanguage('اسمت چیه؟', 'fa')).toBe('fa');
        expect(runLanguage('מה שמך?', 'he')).toBe('he');
        expect(runLanguage('Wie heißt du?', 'de')).toBe('de');
    });

    it('drops a right-to-left code on English fallback help, so its punctuation is not flipped', () => {
        expect(runLanguage('What is your name, and where are you from?', 'fa')).toBeNull();
        expect(runLanguage('', 'ar')).toBeNull();
    });

    it('answers null with no code', () => {
        expect(runLanguage('Hallo', null)).toBeNull();
        expect(runLanguage('Hallo', undefined)).toBeNull();
    });
});
