import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Fake Gemini Live sockets: each `live.connect` records its callbacks so a test
// can play the server's side (setupComplete, goAway, close).
const fake = vi.hoisted(() => ({
    sockets: [] as Array<{ callbacks: any; session: { close: any; sendRealtimeInput: any } }>,
    autoSetup: true,
}));

vi.mock('@google/genai', () => ({
    Modality: { AUDIO: 'AUDIO' },
    GoogleGenAI: class {
        live = {
            connect: async ({ callbacks }: any) => {
                const session = { close: vi.fn(), sendRealtimeInput: vi.fn() };
                fake.sockets.push({ callbacks, session });
                if (fake.autoSetup) setTimeout(() => callbacks.onmessage({ setupComplete: {} }), 0);
                return session;
            },
        };
    },
}));

const run = vi.hoisted(() => vi.fn());
vi.mock('@modular-rest/client', () => ({ functionProvider: { run } }));
vi.mock('~/stores/profile', () => ({ useProfileStore: () => ({ fetchSubscription: async () => {} }) }));

// The store relies on Nuxt auto-imports and browser audio APIs; supply the minimum.
const micTrack = { enabled: true, stop: vi.fn() };
class FakeAudioContext {
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    resume = async () => {};
    close = async () => {};
    createMediaStreamSource() {
        return { connect: () => {}, disconnect: () => {} };
    }
    createGain() {
        return { gain: { value: 1 }, connect: () => ({}) };
    }
}
class FakeWorkletNode {
    port = { onmessage: null as any };
    connect(node: any) {
        return node;
    }
    disconnect() {}
}

const vue = await vi.importActual<typeof import('vue')>('vue');
Object.assign(globalThis, {
    ref: vue.ref,
    computed: vue.computed,
    authUser: { value: { id: 'u1' } },
    AudioContext: FakeAudioContext,
    AudioWorkletNode: FakeWorkletNode,
});
Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getAudioTracks: () => [micTrack], getTracks: () => [micTrack] }) },
});

const { useLiveSessionGeminiStore } = await import('~/stores/liveSessionGemini');

const events: string[] = [];
const debits = () => run.mock.calls.filter(([call]: any) => call.name === 'debit-voice-minutes');

async function startSession() {
    const store = useLiveSessionGeminiStore();
    await store.createLiveSession({
        sessionDetails: { instructions: 'practice', voice: 'Kore' },
        metadata: {} as any,
        tools: {},
        audioRef: null,
        onUpdate: (e: any) => e?.type && events.push(e.type),
    } as any);
    return store;
}

describe('liveSessionGemini store: connection loss', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        fake.sockets.length = 0;
        fake.autoSetup = true;
        events.length = 0;
        let now = 1_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000));
        run.mockImplementation(async ({ name }: any) =>
            name === 'request-gemini-live-session-ephemeral-token' ? { model: 'm', client_secret: { value: 'token' } } : { _id: 'rec1' }
        );
    });

    it('reports a dropped live socket and tears the session down', async () => {
        const store = await startSession();
        expect(store.sessionStarted).toBe(true);

        fake.sockets[0].callbacks.onclose({});

        expect(events).toContain('session-dropped');
        expect(store.sessionStarted).toBe(false);
        expect(micTrack.stop).toHaveBeenCalled();
        expect(debits()).toHaveLength(1);
    });

    it('does not report a drop when the session is ended on purpose', async () => {
        const store = await startSession();

        store.endLiveSession();
        fake.sockets[0].callbacks.onclose({});

        expect(events).not.toContain('session-dropped');
        expect(debits()).toHaveLength(1);
    });

    it("keeps a resumed session alive when the old leg's socket closes late", async () => {
        const store = await startSession();
        const first = fake.sockets[0].callbacks;
        first.onmessage({ sessionResumptionUpdate: { newHandle: 'h1' } });

        fake.autoSetup = false;
        first.onmessage({ goAway: { timeLeft: '5s' } });
        await vi.waitFor(() => expect(fake.sockets).toHaveLength(2));

        // The old socket's close lands while the new leg is still setting up.
        first.onclose({});
        fake.sockets[1].callbacks.onmessage({ setupComplete: {} });
        await vi.waitFor(() => expect(events).toContain('session-resumed'));

        expect(events).not.toContain('session-dropped');
        expect(store.sessionStarted).toBe(true);
        expect(debits()).toHaveLength(0);
    });

    it('leaves a close before setupComplete to the start failure path', async () => {
        fake.autoSetup = false;
        const pending = startSession();
        await vi.waitFor(() => expect(fake.sockets).toHaveLength(1));

        fake.sockets[0].callbacks.onclose({});

        await expect(pending).rejects.toThrow('WebSocket closed before setup');
        expect(events).not.toContain('session-dropped');
    });
});
