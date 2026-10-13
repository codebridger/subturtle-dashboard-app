/**
 * The live practice coach (prompt, tools, hidden messages, rules) lives in
 * shared/live-practice/spec.json and is shared with the mobile app. These tests
 * keep both sides on it:
 *  - the web builds everything from the spec (no private copy);
 *  - mobile's generated Dart file embeds the same spec. If this fails, run
 *    `dart run tool/gen_live_practice.dart` in mobile/packages/subturtle_api.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import spec from '../../../../shared/live-practice/spec.json';
import { buildInstructions, buildPracticeTools, cardSelectedMessage, resolveNativeLanguage, welcomeMessage } from '~/utils/livePractice';

const root = resolve(__dirname, '../../../..');

describe('live coach spec', () => {
    it('mobile embeds the current spec (regenerate it when this fails)', () => {
        const specText = readFileSync(resolve(root, 'shared/live-practice/spec.json'), 'utf8');
        const dart = readFileSync(resolve(root, 'mobile/packages/subturtle_api/lib/src/coach/live_practice_spec.g.dart'), 'utf8');
        const embedded = dart.match(/const String _specJson = r'''\n([\s\S]*)''';/);
        expect(embedded, 'live_practice_spec.g.dart has no embedded spec').not.toBeNull();
        expect(embedded![1]).toBe(specText);
    });

    it('builds the prompt from the spec template', () => {
        const phrases = [{ phrase: 'had to', translation: 'باید', translation_language: 'Persian' }] as any;
        expect(buildInstructions(phrases, 'Persian')).toBe(
            spec.instructionsTemplate.replace(/\[nativeLanguage\]/g, 'Persian').replace('[phrases]', '1. had to: باید')
        );
        expect(resolveNativeLanguage({ nativeLanguage: 'auto' } as any, phrases)).toBe("Persian (auto-detected from the bundle's translation language)");
    });

    it('declares the spec tools and messages', () => {
        const tools = buildPracticeTools({ getPhrases: () => [], setActiveIndex: () => {}, onFinish: () => {} });
        const definitions = Object.values(tools).map((t) => {
            const { type, ...rest } = t.definition as any;
            expect(type).toBe('function');
            return rest;
        });
        expect(definitions).toEqual(spec.tools);
        expect(welcomeMessage('voice', true)).toBe(`${spec.messages.welcome}\nThen encourage the user to unmute the microphone, microphone is muted`);
        expect(welcomeMessage('text')).toBe(`${spec.messages.welcome}\n${spec.messages.welcomeText}`);
        expect(cardSelectedMessage('now')).toBe('The user selected a different vocabulary: "now". Let\'s start practicing on it.');
        expect(tools.activate_phrase.handler({ index: 9 })).toEqual({ success: false, message: 'Could not find a vocabulary matching {"index":9}.' });
    });

    it('keeps the rules both apps follow', () => {
        expect(spec.rules).toMatchObject({ micStartsMuted: true, practicedOn: 'user-turn', singlePhraseStartsActive: true });
    });
});
