/**
 * Gemini Live API Pinia store for live practice sessions
 *
 *   • Connection: WebSocket via `@google/genai` SDK (`ai.live.connect`),
 *     authenticated with a server-issued ephemeral token (v1alpha API).
 *   • Mic capture: `AudioWorklet` ("pcm16-downsampler") resamples the device
 *     stream to 16kHz Int16 PCM and posts ~20ms chunks back to the main
 *     thread, which base64-encodes and sends them as `realtimeInput.audio`.
 *   • Playback: incoming 24kHz PCM frames are scheduled as
 *     `AudioBufferSourceNode`s with a running `nextStartTime` so chunks play
 *     gaplessly. On `serverContent.interrupted`, queued sources are stopped.
 *   • Session continuity: the model's audio-only sessions cap at 15 minutes,
 *     so we transparently swap connections by issuing a fresh token and
 *     reconnecting with the latest `sessionResumption.handle`.
 *
 * Server-side: the matching function `request-gemini-live-session-ephemeral-token`
 * locks the `liveConnectConstraints` (model, response modalities, system
 * instruction, voice, transcription, resumption, sliding-window compression)
 * at token issuance.
 *
 * The OpenAI Realtime backend module still lives under
 * `server/src/modules/live_session/openai/` so historical session records
 * keep pricing correctly, but no frontend code reaches it anymore.
 */
import { defineStore } from 'pinia';
import { functionProvider } from '@modular-rest/client';
import { GoogleGenAI, Modality } from '@google/genai';
import type {
    LiveServerMessage,
    Session,
    Content,
    LiveConnectConfig,
    LiveServerContent,
    FunctionCall,
    UsageMetadata,
    Transcription,
} from '@google/genai';
import type {
    ConversationDialogType,
    GeminiLiveSessionType,
    GeminiTokenUsageType,
    LiveSessionMetadataType,
    LiveSessionRecordType,
} from '~/types/live-session.type';

type ConnState =
    | 'idle'
    | 'connecting'
    | 'setup-pending'
    | 'ready'
    | 'recording'
    | 'goingAway'
    | 'resuming'
    | 'closed';

interface CreateOptions {
    sessionDetails: {
        instructions: string;
        voice?: string;
    };
    metadata?: LiveSessionMetadataType;
    tools: { [key: string]: { handler: (args: any) => any; definition: any } };
    onUpdate?: (data: any) => void;
    /**
     * Accepted for legacy callers. Gemini playback runs through
     * `AudioContext`, so no `<audio>` element is needed.
     */
    audioRef: HTMLAudioElement | null;
}

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
// Audio-only Gemini sessions cap at 15 minutes; resume one minute before that
// so the user never sees a gap.
const RESUME_PRE_EMPTIVE_MS = 14 * 60 * 1000;
const PLAYBACK_LEAD_SEC = 0.02;
const SETUP_COMPLETE_TIMEOUT_MS = 10_000;
const DEFAULT_MODEL = 'gemini-3.1-flash-live-preview';
const DEFAULT_VOICE = 'Kore';

export const useLiveSessionGeminiStore = defineStore('liveSessionGemini', () => {
    // ----- Reactive state -----
    const id = ref<string | null>(null);
    const liveSession = ref<GeminiLiveSessionType | null>(null);
    const sessionStarted = ref(false);
    const conversationDialogs = ref<ConversationDialogType[]>([]);
    const isMicrophoneMuted = ref(false);
    const tokenUsage = ref<GeminiTokenUsageType | null>(null);
    const metadata = ref<LiveSessionMetadataType | null>(null);
    const connState = ref<ConnState>('idle');

    // ----- Module-scoped, non-reactive (connection + audio plumbing) -----
    let session: Session | null = null;
    let inputAudioContext: AudioContext | null = null;
    let outputAudioContext: AudioContext | null = null;
    let microphoneStream: MediaStream | null = null;
    let microphoneTrack: MediaStreamTrack | null = null;
    let micSourceNode: MediaStreamAudioSourceNode | null = null;
    let workletNode: AudioWorkletNode | null = null;
    const pendingSources = new Set<AudioBufferSourceNode>();
    let nextStartTime = 0;

    // Resumption + tool state
    let lastResumptionHandle: string | null = null;
    let resumeTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let isResuming = false;
    let sessionTools: CreateOptions['tools'] | null = null;
    let onUpdateCallback: ((data: any) => void) | null = null;
    let currentInstructions = '';
    let currentVoice = DEFAULT_VOICE;

    // Per-turn dialog accumulation. Gemini delivers transcripts as incremental
    // text chunks; we synthesize stable ids per turn so chunks merge into one
    // dialog row instead of producing a row per chunk.
    let currentUserDialogId: string | null = null;
    let currentAiDialogId: string | null = null;
    let turnCounter = 0;

    // ----- Getters -----
    const isSessionActive = computed(() => sessionStarted.value);
    const getConversationDialogs = computed(() => conversationDialogs.value);
    const getMicrophoneMuted = computed(() => isMicrophoneMuted.value);

    // ----- Public actions -----

    /**
     * Issue an ephemeral token, persist a session record, set up the audio
     * pipeline, and open the live WebSocket. Resolves once the server has
     * acknowledged setup; only then is it safe to send messages.
     */
    async function createLiveSession(options: CreateOptions) {
        const { sessionDetails, tools, onUpdate, metadata: meta } = options;

        sessionTools = tools;
        onUpdateCallback = onUpdate || null;
        metadata.value = meta || null;
        currentInstructions = sessionDetails.instructions;
        currentVoice = sessionDetails.voice || DEFAULT_VOICE;

        try {
            connState.value = 'connecting';

            const sessionMeta = await functionProvider.run<GeminiLiveSessionType>({
                name: 'request-gemini-live-session-ephemeral-token',
                args: {
                    userId: authUser.value?.id,
                    instructions: currentInstructions,
                    voice: currentVoice,
                    tools: convertToolsForGemini(tools),
                },
            });
            liveSession.value = sessionMeta;
            await createLiveSessionRecordOnServer();

            // Set up the mic + playback pipelines before opening the socket so
            // we can stream the moment setup completes.
            await setupAudio();
            await connectLive(sessionMeta.client_secret.value);

            // Mic starts muted so the user explicitly chooses to start speaking.
            toggleMicrophone(false);

            sessionStarted.value = true;
            return { success: true, session: sessionMeta };
        } catch (error) {
            console.error('Failed to create Gemini live session:', error);
            endLiveSession();
            throw error;
        }
    }

    /**
     * Tear down the WebSocket, audio graph, microphone tracks, and timers.
     * Safe to call multiple times.
     */
    function endLiveSession() {
        if (resumeTimeoutId) {
            clearTimeout(resumeTimeoutId);
            resumeTimeoutId = null;
        }

        if (session) {
            try {
                session.close();
            } catch {
                /* already closed */
            }
            session = null;
        }

        dropPlayback();

        if (workletNode) {
            try {
                workletNode.port.onmessage = null;
                workletNode.disconnect();
            } catch { }
            workletNode = null;
        }
        if (micSourceNode) {
            try {
                micSourceNode.disconnect();
            } catch { }
            micSourceNode = null;
        }
        if (microphoneTrack) {
            microphoneTrack.stop();
            microphoneTrack = null;
        }
        if (microphoneStream) {
            microphoneStream.getTracks().forEach((t) => t.stop());
            microphoneStream = null;
        }
        if (inputAudioContext) {
            inputAudioContext.close().catch(() => { });
            inputAudioContext = null;
        }
        if (outputAudioContext) {
            outputAudioContext.close().catch(() => { });
            outputAudioContext = null;
        }

        sessionStarted.value = false;
        liveSession.value = null;
        isMicrophoneMuted.value = false;
        connState.value = 'closed';
        return { success: true };
    }

    /**
     * Send a free-form text turn to the model. Audio-output models respond to
     * `realtimeInput.text` with an immediate audio turn; `sendClientContent`
     * does not reliably trigger a response in audio-only mode.
     */
    function sendMessage(message: string) {
        if (!session) throw new Error('No active Gemini session');
        try {
            // Capture the message locally so it appears in the dialog history
            appendDialog(message, 'user');
            session.sendRealtimeInput({ text: message } as any);
        } catch (error) {
            console.error('Failed to send Gemini message:', error);
        }
    }

    /**
     * Nudge the model to start speaking. Same wire format as `sendMessage`;
     * kept as a separate verb so callers can express intent.
     */
    function triggerConversation(message: string) {
        if (!session) throw new Error('No active Gemini session');
        try {
            session.sendRealtimeInput({ text: message } as any);
        } catch (error) {
            console.error('Failed to trigger Gemini conversation:', error);
        }
    }

    /**
     * Toggle the microphone on/off. Pass `active=true` to force-unmute,
     * `active=false` to force-mute, or omit to flip the current state.
     */
    function toggleMicrophone(active?: boolean) {
        if (!microphoneTrack) return isMicrophoneMuted.value;
        if (active !== undefined) {
            isMicrophoneMuted.value = !active;
            microphoneTrack.enabled = active;
        } else {
            isMicrophoneMuted.value = !isMicrophoneMuted.value;
            microphoneTrack.enabled = !isMicrophoneMuted.value;
        }
        return isMicrophoneMuted.value;
    }

    function clearConversationDialogs() {
        conversationDialogs.value = [];
        currentUserDialogId = null;
        currentAiDialogId = null;
    }

    // ----- Internals: audio pipeline -----

    async function setupAudio() {
        // Output context — receives 24kHz PCM frames and schedules them for playback.
        outputAudioContext = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
        await outputAudioContext.resume();
        nextStartTime = outputAudioContext.currentTime;

        // Input context — captures mic and downsamples to 16kHz Int16 in the
        // worklet running on the audio thread.
        inputAudioContext = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
        await inputAudioContext.resume();

        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });
        microphoneTrack = microphoneStream.getAudioTracks()[0] || null;

        await inputAudioContext.audioWorklet.addModule('/worklets/pcm16-downsampler.js');
        micSourceNode = inputAudioContext.createMediaStreamSource(microphoneStream);
        workletNode = new AudioWorkletNode(inputAudioContext, 'pcm16-downsampler');
        workletNode.port.onmessage = handleWorkletMessage;
        micSourceNode.connect(workletNode);

        // The browser only schedules an `AudioWorkletProcessor.process()` call
        // when the node's output has a downstream sink. The worklet does not
        // write any audio to its output, so we route it through a
        // gain-zero node to the destination — silent, but enough to keep the
        // processor scheduled.
        const silentGain = inputAudioContext.createGain();
        silentGain.gain.value = 0;
        workletNode.connect(silentGain).connect(inputAudioContext.destination);
    }

    function handleWorkletMessage(e: MessageEvent) {
        if (!session) return;
        if (isMicrophoneMuted.value) return;
        if (connState.value !== 'ready' && connState.value !== 'recording') return;

        const int16: Int16Array = e.data;
        if (!int16 || int16.length === 0) return;

        try {
            session.sendRealtimeInput({
                audio: {
                    data: int16ToBase64(int16),
                    mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
                },
            });
            if (connState.value === 'ready') connState.value = 'recording';
        } catch (err) {
            console.warn('Failed to send mic chunk', err);
        }
    }

    function playAudioChunk(base64: string) {
        if (!outputAudioContext) return;
        // Browsers may suspend the AudioContext if the user gesture chain was
        // broken by intervening async hops. Resume lazily on each chunk.
        if (outputAudioContext.state === 'suspended') {
            outputAudioContext.resume().catch(() => { });
        }
        const bytes = base64ToBytes(base64);
        if (bytes.length < 2) return;

        // Raw bytes → little-endian Int16 → normalized Float32.
        const int16 = new Int16Array(
            bytes.buffer,
            bytes.byteOffset,
            Math.floor(bytes.length / 2)
        );
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

        const ctx = outputAudioContext;
        const buffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
        buffer.copyToChannel(float32, 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        // Clamp `nextStartTime` forward when the queue has fallen behind so we
        // don't fire a backlog of sources at currentTime simultaneously.
        const startAt = Math.max(ctx.currentTime + PLAYBACK_LEAD_SEC, nextStartTime);
        source.start(startAt);
        nextStartTime = startAt + buffer.duration;
        pendingSources.add(source);
        source.onended = () => pendingSources.delete(source);
    }

    function dropPlayback() {
        for (const s of pendingSources) {
            try {
                s.stop();
                s.disconnect();
            } catch { }
        }
        pendingSources.clear();
        if (outputAudioContext) {
            nextStartTime = outputAudioContext.currentTime;
        }
    }

    // ----- Internals: WebSocket lifecycle -----

    async function connectLive(token: string, resumeHandle?: string) {
        connState.value = 'setup-pending';

        const ai = new GoogleGenAI({
            apiKey: token,
            httpOptions: { apiVersion: 'v1alpha' },
        } as any);

        const liveConfig: LiveConnectConfig = {
            responseModalities: [Modality.AUDIO],
            systemInstruction: { parts: [{ text: currentInstructions }] },
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: currentVoice } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
            contextWindowCompression: { slidingWindow: {} },
        };

        if (sessionTools) {
            const declarations = convertToolsForGemini(sessionTools);
            if (declarations.length > 0) {
                liveConfig.tools = [{ functionDeclarations: declarations }];
            }
        }

        // The SDK's `connect` promise resolves as soon as the socket opens —
        // BEFORE the server's `setupComplete` arrives. Any client message sent
        // in that window is silently dropped, so we wait on a separate promise
        // resolved by the inbound `setupComplete` handler.
        let resolveSetupComplete!: () => void;
        let rejectSetupComplete!: (err: unknown) => void;
        const setupCompletePromise = new Promise<void>((res, rej) => {
            resolveSetupComplete = res;
            rejectSetupComplete = rej;
        });

        const newSession = await ai.live.connect({
            model: liveSession.value?.model || DEFAULT_MODEL,
            config: liveConfig,
            callbacks: {
                onopen: () => { },
                onmessage: (msg: LiveServerMessage) => {
                    if ((msg as any).setupComplete) resolveSetupComplete();
                    try {
                        onLiveMessage(msg);
                    } catch (err) {
                        console.error('[gemini-live] error handling message', err);
                    }
                },
                onerror: (e: any) => {
                    console.error('[gemini-live] error', e);
                    rejectSetupComplete?.(e);
                    onUpdateCallback?.({ type: 'error', error: e });
                },
                onclose: (_e: any) => {
                    rejectSetupComplete?.(new Error('WebSocket closed before setup'));
                    if (connState.value !== 'resuming') {
                        connState.value = 'closed';
                        sessionStarted.value = false;
                    }
                },
            },
        });

        session = newSession;

        await Promise.race([
            setupCompletePromise,
            new Promise<void>((_, reject) =>
                setTimeout(
                    () => reject(new Error('setupComplete timed out')),
                    SETUP_COMPLETE_TIMEOUT_MS
                )
            ),
        ]);

        connState.value = 'ready';
        armResumeTimer();
    }

    function armResumeTimer() {
        if (resumeTimeoutId) clearTimeout(resumeTimeoutId);
        resumeTimeoutId = setTimeout(() => {
            requestResume('preemptive').catch((err) =>
                console.error('Pre-emptive resume failed', err)
            );
        }, RESUME_PRE_EMPTIVE_MS);
    }

    /**
     * Issue a fresh ephemeral token and reconnect using the most recent
     * `sessionResumption.handle`, swapping the live `Session` reference once
     * the new socket is ready. Audio queued from the old socket drains
     * naturally because already-scheduled `AudioBufferSourceNode`s keep
     * playing.
     */
    async function requestResume(reason: 'goAway' | 'preemptive') {
        if (isResuming) return;
        if (!sessionStarted.value) return;
        if (!lastResumptionHandle) {
            console.warn(
                `[gemini-live] resume requested (${reason}) but no resumption handle is available; ending session.`
            );
            onUpdateCallback?.({ type: 'session-resume-failed', reason });
            endLiveSession();
            return;
        }

        isResuming = true;
        const previousState = connState.value;
        connState.value = 'resuming';
        onUpdateCallback?.({ type: 'session-resuming', reason });

        try {
            // `isResume: true` tells the server not to consume another
            // freemium session slot for this leg.
            const sessionMeta = await functionProvider.run<GeminiLiveSessionType>({
                name: 'request-gemini-live-session-ephemeral-token',
                args: {
                    userId: authUser.value?.id,
                    instructions: currentInstructions,
                    voice: currentVoice,
                    tools: sessionTools ? convertToolsForGemini(sessionTools) : [],
                    isResume: true,
                },
            });
            liveSession.value = sessionMeta;

            // Close the old session AFTER we have a token but BEFORE opening
            // the new socket so we don't double-bill any frames.
            const old = session;
            session = null;
            try {
                old?.close();
            } catch { }

            await connectLive(sessionMeta.client_secret.value, lastResumptionHandle);
            isResuming = false;
            onUpdateCallback?.({ type: 'session-resumed' });
        } catch (err) {
            isResuming = false;
            connState.value = previousState;
            console.error('Failed to resume Gemini session', err);
            onUpdateCallback?.({ type: 'session-resume-failed', reason, error: err });
            endLiveSession();
        }
    }

    // ----- Internals: message dispatch -----

    function onLiveMessage(msg: LiveServerMessage) {
        // Surface every event to the practice page so it can handle UI
        // concerns (toasts, analytics) without re-implementing the SDK.
        onUpdateCallback?.(msg);

        const sc = msg.serverContent;
        if (sc) {
            if (sc.modelTurn?.parts) {
                for (const part of sc.modelTurn.parts) {
                    if (part?.inlineData?.data) playAudioChunk(part.inlineData.data);
                    if (part?.text) appendDialog(part.text, 'ai');
                }
            }
            if (sc.outputTranscription?.text) {
                appendDialog(sc.outputTranscription.text, 'ai');
            }
            if (sc.outputTranscription?.finished) {
                if (currentAiDialogId) flushDialogToServer([currentAiDialogId]);
            }
            if (sc.inputTranscription?.text) {
                appendDialog(sc.inputTranscription.text, 'user');
            }
            if (sc.inputTranscription?.finished) {
                if (currentUserDialogId) flushDialogToServer([currentUserDialogId]);
            }
            if (sc.interrupted) {
                const turnIds = [currentUserDialogId, currentAiDialogId].filter(Boolean) as string[];
                flushDialogToServer(turnIds);
                dropPlayback();
            }
            if (sc.turnComplete || sc.generationComplete) {
                // Finalize the current turn so the next chunk starts a new dialog row.
                const turnIds = [currentUserDialogId, currentAiDialogId].filter(Boolean) as string[];
                flushDialogToServer(turnIds);

                currentUserDialogId = null;
                currentAiDialogId = null;
                turnCounter += 1;
            }
        }

        if (msg.toolCall?.functionCalls) handleToolCalls(msg.toolCall.functionCalls);

        if (msg.usageMetadata) {
            updateTokenUsageWithPartialData(mapGeminiUsage(msg.usageMetadata));
        }

        if (msg.sessionResumptionUpdate?.newHandle) {
            lastResumptionHandle = msg.sessionResumptionUpdate.newHandle;
        }

        if (msg.goAway) {
            connState.value = 'goingAway';
            onUpdateCallback?.({ type: 'goAway', timeLeft: msg.goAway.timeLeft });
            requestResume('goAway').catch((err) =>
                console.error('Resume on goAway failed', err)
            );
        }
    }

    function handleToolCalls(functionCalls: FunctionCall[]) {
        if (!session || !sessionTools) return;
        const responses = functionCalls.map((call) => {
            const name = call.name as string;
            const args = call.args || {};
            const tool = sessionTools![name];
            let result: any;
            if (!tool) {
                result = { success: false, message: `Function ${name} not found` };
            } else {
                try {
                    const out = tool.handler(args);
                    result = out instanceof Promise ? out : Promise.resolve(out);
                } catch (err) {
                    result = { success: false, message: String(err) };
                }
            }
            return { id: call.id, name, response: { output: result } };
        });

        try {
            session.sendToolResponse({ functionResponses: responses });
        } catch (err) {
            console.warn('Failed to send Gemini tool response', err);
        }
    }

    // ----- Internals: dialog accumulation + persistence -----

    function appendDialog(text: string, speaker: 'user' | 'ai') {
        if (!text) return;
        let dialogId = speaker === 'user' ? currentUserDialogId : currentAiDialogId;

        if (!dialogId) {
            dialogId = `${speaker}-${turnCounter}-${Date.now()}`;
            if (speaker === 'user') currentUserDialogId = dialogId;
            else currentAiDialogId = dialogId;
            conversationDialogs.value.push({ id: dialogId, content: text, speaker });
            return;
        }

        const idx = conversationDialogs.value.findIndex((d) => d.id === dialogId);
        if (idx === -1) {
            conversationDialogs.value.push({ id: dialogId, content: text, speaker });
        } else {
            conversationDialogs.value[idx].content += text;
        }
    }

    function flushDialogToServer(specificIds?: string[]) {
        if (!id.value) return;

        let dialogsToFlush: ConversationDialogType[] = [];

        if (specificIds && specificIds.length > 0) {
            // Flush only the dialogs matching the IDs (e.g. from the current turn)
            dialogsToFlush = conversationDialogs.value.filter(d => specificIds.includes(d.id));
        } else {
            // Fallback: flush everything that hasn't been flushed or just the last one if uncertain
            const total = conversationDialogs.value.length;
            if (total === 0) return;
            dialogsToFlush = [conversationDialogs.value[total - 1]];
        }

        if (dialogsToFlush.length === 0) return;

        functionProvider
            .run({
                name: 'update-live-session-record',
                args: {
                    sessionId: id.value,
                    userId: authUser.value?.id,
                    provider: 'gemini',
                    update: { totalUsage: tokenUsage.value, dialogs: dialogsToFlush },
                },
            })
            .catch((err) => console.warn('Failed to flush dialog', err));
    }

    // ----- Internals: usage tracking -----

    function emptyUsage(): GeminiTokenUsageType {
        return {
            total_tokens: 0,
            prompt_tokens: 0,
            response_tokens: 0,
            tool_use_tokens: 0,
            thoughts_tokens: 0,
            prompt_tokens_details: { text_tokens: 0, audio_tokens: 0, image_tokens: 0, video_tokens: 0 },
            response_tokens_details: { text_tokens: 0, audio_tokens: 0 },
            cached_tokens: 0,
            cached_tokens_details: { text_tokens: 0, audio_tokens: 0 },
        };
    }

    /**
     * Translate Gemini's `usageMetadata` into our backend-shared
     * `GeminiTokenUsageType` so cost calculation can run uniformly server-side.
     */
    function mapGeminiUsage(usageMetadata: UsageMetadata): GeminiTokenUsageType {
        const out = emptyUsage();
        const m = usageMetadata as any;

        out.prompt_tokens = usageMetadata.promptTokenCount || 0;
        out.response_tokens =
            usageMetadata.responseTokenCount || m.candidatesTokenCount || 0;
        out.cached_tokens = usageMetadata.cachedContentTokenCount || 0;
        out.tool_use_tokens = usageMetadata.toolUsePromptTokenCount || 0;
        out.thoughts_tokens = usageMetadata.thoughtsTokenCount || 0;
        out.total_tokens =
            usageMetadata.totalTokenCount ||
            out.prompt_tokens + out.response_tokens + out.cached_tokens;

        for (const d of usageMetadata.promptTokensDetails || []) {
            const c = d.tokenCount || 0;
            switch (String(d.modality || '').toUpperCase()) {
                case 'TEXT':
                    out.prompt_tokens_details.text_tokens += c;
                    break;
                case 'AUDIO':
                    out.prompt_tokens_details.audio_tokens += c;
                    break;
                case 'IMAGE':
                    out.prompt_tokens_details.image_tokens += c;
                    break;
                case 'VIDEO':
                    out.prompt_tokens_details.video_tokens += c;
                    break;
            }
        }

        const responseDetails =
            usageMetadata.responseTokensDetails || m.candidatesTokensDetails || [];
        for (const d of responseDetails) {
            const c = d.tokenCount || 0;
            switch (String(d.modality || '').toUpperCase()) {
                case 'TEXT':
                    out.response_tokens_details.text_tokens += c;
                    break;
                case 'AUDIO':
                    out.response_tokens_details.audio_tokens += c;
                    break;
            }
        }

        for (const d of usageMetadata.cacheTokensDetails || m.cachedContentTokensDetails || []) {
            const c = d.tokenCount || 0;
            switch (String(d.modality || '').toUpperCase()) {
                case 'TEXT':
                    out.cached_tokens_details.text_tokens += c;
                    break;
                case 'AUDIO':
                    out.cached_tokens_details.audio_tokens += c;
                    break;
            }
        }
        return out;
    }

    function updateTokenUsageWithPartialData(partialUsage: GeminiTokenUsageType) {
        if (!tokenUsage.value) tokenUsage.value = emptyUsage();
        const t = tokenUsage.value;

        t.total_tokens += partialUsage.total_tokens;
        t.prompt_tokens += partialUsage.prompt_tokens;
        t.response_tokens += partialUsage.response_tokens;
        t.cached_tokens += partialUsage.cached_tokens;
        t.tool_use_tokens += partialUsage.tool_use_tokens || 0;
        t.thoughts_tokens += partialUsage.thoughts_tokens || 0;
        
        t.prompt_tokens_details.text_tokens += partialUsage.prompt_tokens_details.text_tokens;
        t.prompt_tokens_details.audio_tokens += partialUsage.prompt_tokens_details.audio_tokens;
        t.prompt_tokens_details.image_tokens += partialUsage.prompt_tokens_details.image_tokens;
        t.prompt_tokens_details.video_tokens += partialUsage.prompt_tokens_details.video_tokens || 0;
        
        t.response_tokens_details.text_tokens +=
            partialUsage.response_tokens_details.text_tokens;
        t.response_tokens_details.audio_tokens +=
            partialUsage.response_tokens_details.audio_tokens;
        t.cached_tokens_details.text_tokens += partialUsage.cached_tokens_details.text_tokens;
        t.cached_tokens_details.audio_tokens += partialUsage.cached_tokens_details.audio_tokens;

        return functionProvider
            .run({
                name: 'update-live-session-record',
                args: {
                    sessionId: id.value,
                    userId: authUser.value?.id,
                    provider: 'gemini',
                    update: { partialUsage },
                },
            })
            .catch((err) => console.warn('Failed to record partial usage', err));
    }

    // ----- Internals: server record creation -----

    function createLiveSessionRecordOnServer() {
        return functionProvider
            .run<LiveSessionRecordType>({
                name: 'create-live-session-record',
                args: {
                    type: 'bundle-practice',
                    provider: 'gemini',
                    userId: authUser.value?.id,
                    session: liveSession.value,
                    metadata: metadata.value,
                },
            })
            .then((res) => {
                id.value = res._id;
            });
    }

    // ----- Internals: utilities -----

    /**
     * Translate the practice page's tool definitions
     *   `{ type: 'function', name, description, parameters }`
     * into Gemini's `functionDeclarations` shape
     *   `{ name, description, parameters }`.
     */
    function convertToolsForGemini(tools: CreateOptions['tools']) {
        return Object.values(tools).map((t) => ({
            name: t.definition.name,
            description: t.definition.description,
            parameters: t.definition.parameters,
        }));
    }

    function int16ToBase64(int16: Int16Array): string {
        const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
        let binary = '';
        // Chunked to stay below `String.fromCharCode.apply` argument limits.
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
            binary += String.fromCharCode.apply(null, slice as unknown as number[]);
        }
        return btoa(binary);
    }

    function base64ToBytes(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    return {
        // State
        liveSession,
        sessionStarted,
        conversationDialogs,
        isMicrophoneMuted,
        tokenUsage,
        connState,

        // Getters
        isSessionActive,
        getConversationDialogs,
        getMicrophoneMuted,

        // Actions
        createLiveSession,
        endLiveSession,
        triggerConversation,
        sendMessage,
        clearConversationDialogs,
        toggleMicrophone,
    };
});
