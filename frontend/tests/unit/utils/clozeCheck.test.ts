import { describe, it, expect } from 'vitest';
import { combineResults, gradeClozeAnswer, reasonFromServer } from '~/utils/clozeCheck';

describe('gradeClozeAnswer (D-14, Q4)', () => {
    it('is right for the expected text, ignoring case, spaces and end punctuation', () => {
        expect(gradeClozeAnswer('  Had To ', 'had to').result).toBe('right');
        expect(gradeClozeAnswer('gegangen.', 'gegangen').result).toBe('right');
    });

    it('is right for an accepted answer', () => {
        expect(gradeClozeAnswer('ok', 'okay', { acceptedAnswers: ['ok'] }).result).toBe('right');
    });

    it('treats German ß = ss and ä = ae as right', () => {
        expect(gradeClozeAnswer('Strasse', 'Straße', { language: 'de' }).result).toBe('right');
        expect(gradeClozeAnswer('Maedchen', 'Mädchen', { language: 'de' }).result).toBe('right');
    });

    it('calls a missing accent "almost"', () => {
        expect(gradeClozeAnswer('cafe', 'café', { language: 'fr' })).toEqual({ result: 'close', reason: 'accent' });
        expect(gradeClozeAnswer('esta', 'está', { language: 'es' })).toEqual({ result: 'close', reason: 'accent' });
    });

    it('calls the right word with the wrong ending "almost"', () => {
        expect(gradeClozeAnswer('hablo', 'hablamos', { lemma: 'hablar', language: 'es' })).toEqual({ result: 'close', reason: 'ending' });
        expect(gradeClozeAnswer('gegangenen', 'gegangen', { language: 'de' })).toEqual({ result: 'close', reason: 'ending' });
    });

    it('is wrong for another word or an empty answer', () => {
        expect(gradeClozeAnswer('comer', 'hablamos', { lemma: 'hablar' }).result).toBe('wrong');
        expect(gradeClozeAnswer('', 'had to').result).toBe('wrong');
        expect(gradeClozeAnswer('go', 'do').result).toBe('wrong');
    });
});

describe('combineResults', () => {
    it('takes the weakest blank', () => {
        expect(combineResults(['right', 'close'])).toBe('close');
        expect(combineResults(['right', 'wrong', 'close'])).toBe('wrong');
        expect(combineResults(['right'])).toBe('right');
        expect(combineResults([])).toBeNull();
    });
});

describe('reasonFromServer', () => {
    it('maps check-cloze-answer reasons to the "Almost" line', () => {
        expect(reasonFromServer('accent', 'close')).toBe('accent');
        expect(reasonFromServer('typo', 'close')).toBe('typo');
        expect(reasonFromServer('form', 'close')).toBe('ending');
        expect(reasonFromServer('changes_word', 'wrong')).toBe('none');
        expect(reasonFromServer('spelling', 'right')).toBe('exact');
    });
});
