import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.hoisted(() => vi.fn());
vi.mock('@modular-rest/client', () => ({ functionProvider: { run }, authentication: { user: { id: 'u1' } } }));

const { resolveCoachInstructions } = await import('~/utils/coachInstructions');

const phrases = [{ _id: 'p1', phrase: 'Hallo', translation: 'سلام' }] as any[];
const base = { aiCharacter: 'Kore', source: { phraseIds: ['p1'] } };

describe('resolveCoachInstructions (D-16)', () => {
    beforeEach(() => {
        run.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('asks the server for a multilingual request', async () => {
        run.mockResolvedValue({ instructions: 'SERVER PROMPT', voiceName: 'Leda' });
        const res = await resolveCoachInstructions({ ...base, language: 'de', explanationLanguage: 'fa' }, phrases, 'voice');
        expect(res).toEqual({ instructions: 'SERVER PROMPT', voiceName: 'Leda' });
        expect(run).toHaveBeenCalledWith({
            name: 'get-coach-instructions',
            args: { userId: 'u1', language: 'de', explanationLanguage: 'fa', phraseIds: ['p1'], mode: 'voice' },
        });
    });

    it('falls back to the client prompt when the server has no such function', async () => {
        run.mockRejectedValue({ status: 'error', message: 'Function with name get-coach-instructions not found' });
        const res = await resolveCoachInstructions({ ...base, language: 'de', explanationLanguage: 'fa', nativeLanguage: 'Persian' }, phrases, 'text');
        expect(res.instructions).toContain('Persian');
        expect(res.instructions).toContain('Hallo');
    });

    it('never calls the server for today’s requests', async () => {
        const res = await resolveCoachInstructions({ ...base, nativeLanguage: 'Persian' }, phrases, 'voice');
        expect(run).not.toHaveBeenCalled();
        expect(res.instructions).toContain('Persian');
    });
});
