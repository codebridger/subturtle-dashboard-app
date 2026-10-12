import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const run = vi.hoisted(() => vi.fn());
vi.mock('@modular-rest/client', () => ({ functionProvider: { run } }));

const vue = await vi.importActual<typeof import('vue')>('vue');
Object.assign(globalThis, { ref: vue.ref, computed: vue.computed, authUser: { value: { id: 'u1' } } });

const { useLiveSessionGeminiTextStore, parseTextTurnError } = await import('~/stores/liveSessionGeminiText');

const flush = () => new Promise((r) => setTimeout(r, 0));
const turnCalls = () => run.mock.calls.filter(([call]: any) => call.name === 'text-turn');

async function startSession(onUpdate = vi.fn()) {
    const store = useLiveSessionGeminiTextStore();
    run.mockImplementation(async ({ name }: any) => (name === 'create-text-session' ? { sessionId: 's1', model: 'm' } : undefined));
    await store.createLiveSession({ sessionDetails: { instructions: 'x' }, tools: {}, onUpdate });
    return { store, onUpdate };
}

describe('parseTextTurnError', () => {
    it('reads the stable code and reason from the server message', () => {
        expect(parseTextTurnError({ error: 'COACH_UNAVAILABLE: upstream_quota' }, true)).toMatchObject({
            code: 'COACH_UNAVAILABLE',
            reason: 'upstream_quota',
            sessionClosed: true,
        });
        expect(parseTextTurnError({ error: 'TIER_LIMIT_REACHED: "text_chat_messages_per_chat" limit reached (60)' }, false)).toMatchObject({
            code: 'TIER_LIMIT_REACHED',
            reason: 'text_chat_messages_per_chat',
            sessionClosed: false,
        });
    });

    it('falls back to UNKNOWN for a raw provider error, which never closes the session', () => {
        const parsed = parseTextTurnError({ error: { error: { code: 402, message: 'depleted' } } }, true);
        expect(parsed.code).toBe('UNKNOWN');
        expect(parsed.sessionClosed).toBe(false);
    });
});

describe('liveSessionGeminiText failed turns', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        run.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('exposes a failed first turn and tells the page, instead of failing silently', async () => {
        const { store, onUpdate } = await startSession();
        run.mockRejectedValueOnce({ error: 'COACH_UNAVAILABLE: upstream_quota' });

        store.triggerConversation('welcome');
        await flush();

        expect(store.turnError).toMatchObject({ code: 'COACH_UNAVAILABLE', beforeFirstReply: true, sessionClosed: true });
        expect(onUpdate).toHaveBeenCalledWith({ type: 'turn-failed', error: expect.objectContaining({ code: 'COACH_UNAVAILABLE' }) });

        // A closed session is not retried in place; the page starts a new one.
        store.retryLastTurn();
        await flush();
        expect(turnCalls()).toHaveLength(1);
    });

    it('retries a failed mid-chat turn with the same input and clears the error on success', async () => {
        const { store } = await startSession();
        run.mockResolvedValueOnce({ done: true, text: 'Hi!' });
        store.triggerConversation('welcome');
        await flush();

        run.mockRejectedValueOnce({ error: 'COACH_UNAVAILABLE: upstream_unavailable' });
        store.sendMessage('hello');
        await flush();
        expect(store.turnError).toMatchObject({ beforeFirstReply: false, sessionClosed: false });

        run.mockResolvedValueOnce({ done: true, text: 'Nice.' });
        store.retryLastTurn();
        await flush();

        const [lastCall] = turnCalls().at(-1)!;
        expect(lastCall.args.input).toEqual({ kind: 'user', text: 'hello' });
        expect(store.turnError).toBeNull();
        // The user's message is shown once, not again on retry.
        expect(store.conversationDialogs.filter((d) => d.speaker === 'user')).toHaveLength(1);
        expect(store.conversationDialogs.at(-1)?.content).toBe('Nice.');
    });
});
