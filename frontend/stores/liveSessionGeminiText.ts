/**
 * Text-only live-session Pinia store.
 *
 * The Gemini Live API is audio-out only, so a text-only conversation runs
 * through the server module `live_session_text` (standard `generateContent`).
 * The server holds the authoritative state (system prompt, tool declarations,
 * the model `contents[]` history, cumulative usage); this store is a thin view
 * that keeps a display transcript, the `sessionId`, and the tool *handlers*.
 *
 * It mirrors the public surface the practice page reads from the voice store
 * (`liveSessionGemini`) so the page can use either one. Audio-only members
 * (`isMicrophoneMuted`, `micLevel`, `toggleMicrophone`) are inert here.
 */
import { defineStore } from 'pinia';
import { functionProvider } from '@modular-rest/client';
import type { TextDialogType, TextTokenUsageType, TextTurnInput } from '~/types/live-session-text.type';
import type { LiveSessionMetadataType } from '~/types/live-session.type';
import { COACH_UNAVAILABLE_CODE } from '~/types/tiers';
import { fillSpec, LIVE_PRACTICE } from '~/utils/livePractice';

type ConnState = 'idle' | 'connecting' | 'ready' | 'closed';

/**
 * A failed server turn, parsed from the `CODE: detail` message the server throws
 * (`COACH_UNAVAILABLE: upstream_quota`, `AI_CREDIT_EXHAUSTED: …`,
 * `TIER_LIMIT_REACHED: "feature" …`). `code` is `UNKNOWN` for anything else.
 */
export interface TextTurnError {
    code: string;
    /** The detail after the code, e.g. `upstream_quota`; trimmed to a short token. */
    reason?: string;
    message: string;
    /** True when the coach had not answered yet in this session. */
    beforeFirstReply: boolean;
    /**
     * An upstream failure before the first reply: the server refunded the chat
     * start and closed the session, so a retry must start a new session.
     */
    sessionClosed: boolean;
}

export function parseTextTurnError(error: any, beforeFirstReply: boolean): TextTurnError {
    const raw = error?.error ?? error?.message ?? error;
    const message = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
    const match = message.match(/^([A-Z][A-Z_]+):\s*(.*)$/s);
    if (!match) return { code: 'UNKNOWN', message, beforeFirstReply, sessionClosed: false };
    const quoted = match[2].match(/"([^"]+)"/);
    const reason = (quoted ? quoted[1] : match[2].split(/\s/)[0]) || undefined;
    const sessionClosed = beforeFirstReply && match[1] === COACH_UNAVAILABLE_CODE;
    return { code: match[1], reason, message, beforeFirstReply, sessionClosed };
}

interface CreateOptions {
    sessionDetails: {
        instructions: string;
        voice?: string;
        /** Optional Gemini text model; the server defaults it when omitted. */
        model?: string;
    };
    metadata?: LiveSessionMetadataType;
    tools: { [key: string]: { handler: (args: any) => any; definition: any } };
    onUpdate?: (data: any) => void;
    /** Accepted for parity with the voice store; text mode has no audio element. */
    audioRef?: HTMLAudioElement | null;
}

interface TurnResult {
    done: boolean;
    text?: string;
    functionCalls?: { id?: string; name: string; args?: any }[];
    usage?: TextTokenUsageType;
    totalUsage?: TextTokenUsageType;
}

export const useLiveSessionGeminiTextStore = defineStore('liveSessionGeminiText', () => {
    // ----- Reactive state (public surface shared with the voice store) -----
    const sessionStarted = ref(false);
    const conversationDialogs = ref<TextDialogType[]>([]);
    const tokenUsage = ref<TextTokenUsageType | null>(null);
    const connState = ref<ConnState>('idle');
    // Inert audio fields so the page's voice-oriented template bindings resolve.
    const isMicrophoneMuted = ref(true);
    const micLevel = ref(0);
    const metadata = ref<LiveSessionMetadataType | null>(null);
    /** The last failed turn, shown by the page with a Retry; cleared on success. */
    const turnError = ref<TextTurnError | null>(null);
    /** Whether the coach has answered at least once in this session. */
    const coachHasReplied = ref(false);

    // ----- Module-scoped, non-reactive -----
    let sessionId: string | null = null;
    let sessionTools: CreateOptions['tools'] | null = null;
    let onUpdateCallback: ((data: any) => void) | null = null;
    let lastFailedInput: TextTurnInput | null = null;

    // ----- Getters -----
    const isSessionActive = computed(() => sessionStarted.value);
    const getConversationDialogs = computed(() => conversationDialogs.value);
    const getMicrophoneMuted = computed(() => isMicrophoneMuted.value);

    // ----- Public actions -----

    async function createLiveSession(options: CreateOptions) {
        clearConversationDialogs();
        tokenUsage.value = null;
        turnError.value = null;
        coachHasReplied.value = false;
        lastFailedInput = null;
        sessionId = null;
        sessionTools = options.tools;
        onUpdateCallback = options.onUpdate || null;
        metadata.value = options.metadata || null;
        connState.value = 'connecting';

        try {
            const res = await functionProvider.run<{ sessionId: string; model: string }>({
                name: 'create-text-session',
                args: {
                    userId: authUser.value?.id,
                    instructions: options.sessionDetails.instructions,
                    toolDeclarations: convertToolsForGemini(options.tools),
                    model: options.sessionDetails.model,
                    metadata: options.metadata,
                },
            });
            sessionId = res.sessionId;
            sessionStarted.value = true;
            connState.value = 'ready';
            return { success: true, session: res };
        } catch (error) {
            connState.value = 'closed';
            sessionStarted.value = false;
            throw error;
        }
    }

    function endLiveSession() {
        sessionStarted.value = false;
        connState.value = 'closed';
        return { success: true };
    }

    /** A real user message — shown in the transcript and sent as a user turn. */
    function sendMessage(message: string) {
        if (!sessionId || !sessionStarted.value) return;
        appendDialog(message, 'user');
        runTurn({ kind: 'user', text: message });
    }

    /** A system nudge (welcome / card-switch) — drives a turn but isn't shown. */
    function triggerConversation(message: string) {
        if (!sessionId || !sessionStarted.value) return;
        runTurn({ kind: 'system', text: message });
    }

    /**
     * Re-send the turn that failed. Not valid for a closed session (see
     * `TextTurnError.sessionClosed`); the page starts a new session instead.
     */
    function retryLastTurn() {
        if (!lastFailedInput || !turnError.value || turnError.value.sessionClosed) return;
        const input = lastFailedInput;
        turnError.value = null;
        lastFailedInput = null;
        runTurn(input);
    }

    // No-op: text mode has no microphone. Kept for voice-store parity.
    function toggleMicrophone(_active?: boolean) {
        return isMicrophoneMuted.value;
    }

    function clearConversationDialogs() {
        conversationDialogs.value = [];
    }

    // ----- Internals -----

    /**
     * Run one server turn, then drive the function-call loop: when the model
     * asks for tools, execute the client-side handlers (UI effects) and feed the
     * results back until the model returns plain text.
     */
    async function runTurn(input: TextTurnInput) {
        if (!sessionId) return;
        try {
            const res = await functionProvider.run<TurnResult>({
                name: 'text-turn',
                args: { userId: authUser.value?.id, sessionId, input },
            });

            // Server returns the authoritative cumulative usage each turn.
            if (res?.totalUsage) tokenUsage.value = res.totalUsage;
            coachHasReplied.value = true;
            turnError.value = null;

            if (res?.done === false && res.functionCalls?.length) {
                const results = res.functionCalls.map((fc) => {
                    const tool = sessionTools?.[fc.name];
                    let output: any;
                    if (!tool) {
                        output = { success: false, message: fillSpec(LIVE_PRACTICE.messages.toolNotFound, { name: fc.name }) };
                    } else {
                        try {
                            output = tool.handler(fc.args || {});
                        } catch (err) {
                            output = { success: false, message: String(err) };
                        }
                    }
                    return { id: fc.id, name: fc.name, output };
                });

                // A tool (e.g. finish_practice) may have ended the session.
                if (!sessionStarted.value) return;
                return runTurn({ kind: 'toolResults', results });
            }

            if (res?.text) appendDialog(res.text, 'ai');
        } catch (error: any) {
            // Surface the server's message (modular-rest puts it on `error.error`)
            // rather than an opaque object, so failures are debuggable.
            console.error('Failed to run text turn:', error?.error ?? error?.message ?? error);
            const parsed = parseTextTurnError(error, !coachHasReplied.value);
            turnError.value = parsed;
            lastFailedInput = input;
            onUpdateCallback?.({ type: 'turn-failed', error: parsed });
        }
    }

    function appendDialog(content: string, speaker: 'user' | 'ai') {
        if (!content) return;
        conversationDialogs.value.push({
            id: `${speaker}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            content,
            speaker,
        });
    }

    /**
     * Translate the page's tool map into Gemini `functionDeclarations`. Only the
     * declarations cross to the server; the handlers stay on the client.
     */
    function convertToolsForGemini(tools: CreateOptions['tools']) {
        return Object.values(tools).map((t) => ({
            name: t.definition.name,
            description: t.definition.description,
            parameters: t.definition.parameters,
        }));
    }

    return {
        // State
        sessionStarted,
        conversationDialogs,
        tokenUsage,
        connState,
        isMicrophoneMuted,
        micLevel,
        turnError,
        coachHasReplied,

        // Getters
        isSessionActive,
        getConversationDialogs,
        getMicrophoneMuted,

        // Actions
        createLiveSession,
        endLiveSession,
        triggerConversation,
        sendMessage,
        retryLastTurn,
        toggleMicrophone,
        clearConversationDialogs,
    };
});
