import { defineStore } from 'pinia';
import { functionProvider } from '@modular-rest/client';
import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveServerMessage, Session } from '@google/genai';
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
    // audioRef is accepted for API compatibility with the OpenAI store; the
    // Gemini implementation plays through AudioContext and does not need an
    // <audio> element.
    audioRef: HTMLAudioElement | null;
}

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const RESUME_PRE_EMPTIVE_MS = 14 * 60 * 1000; // 14 minutes; cap is 15
const PLAYBACK_LEAD_SEC = 0.02;

export const useLiveSessionGeminiStore = defineStore('liveSessionGemini', () => {
    // ----- Reactive state (mirrors OpenAI store's public surface) -----
    const id = ref<string | null>(null);
    const liveSession = ref<GeminiLiveSessionType | null>(null);
    const sessionStarted = ref(false);
    const conversationDialogs = ref<ConversationDialogType[]>([]);
    const isMicrophoneMuted = ref(false);
    const tokenUsage = ref<GeminiTokenUsageType | null>(null);
    const metadata = ref<LiveSessionMetadataType | null>(null);
    const connState = ref<ConnState>('idle');

    // ----- Module-scoped non-reactive (connection + audio plumbing) -----
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
    let currentVoice = 'Kore';

    // Per-turn dialog accumulation. Gemini delivers transcripts as
    // incremental text chunks; we synthesize stable ids per turn.
    let currentUserDialogId: string | null = null;
    let currentAiDialogId: string | null = null;
    let turnCounter = 0;

    // ----- Getters (compatible with OpenAI store) -----
    const isSessionActive = computed(() => sessionStarted.value);
    const getConversationDialogs = computed(() => conversationDialogs.value);
    const getMicrophoneMuted = computed(() => isMicrophoneMuted.value);

    // ----- Public actions -----

    async function createLiveSession(options: CreateOptions) {
        const { sessionDetails, tools, onUpdate, metadata: meta } = options;

        sessionTools = tools;
        onUpdateCallback = onUpdate || null;
        metadata.value = meta || null;
        currentInstructions = sessionDetails.instructions;
        currentVoice = sessionDetails.voice || 'Kore';

        try {
            connState.value = 'connecting';

            // Issue ephemeral token + persist a session record on the server.
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

            // Set up audio capture / playback before opening the socket so we
            // can attach the worklet immediately when ready.
            await setupAudio();

            // Open the live WebSocket via the official SDK.
            await connectLive(sessionMeta.client_secret.value, undefined);

            // Mic starts muted, matching the OpenAI flow.
            toggleMicrophone(false);

            sessionStarted.value = true;
            return { success: true, session: sessionMeta };
        } catch (error) {
            console.error('Failed to create Gemini live session:', error);
            await endLiveSession();
            throw error;
        }
    }

    function endLiveSession() {
        if (resumeTimeoutId) {
            clearTimeout(resumeTimeoutId);
            resumeTimeoutId = null;
        }

        if (session) {
            try {
                session.close();
            } catch (e) {
                // ignore
            }
            session = null;
        }

        dropPlayback();

        if (workletNode) {
            try {
                workletNode.port.onmessage = null;
                workletNode.disconnect();
            } catch (e) {}
            workletNode = null;
        }
        if (micSourceNode) {
            try {
                micSourceNode.disconnect();
            } catch (e) {}
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
            inputAudioContext.close().catch(() => {});
            inputAudioContext = null;
        }
        if (outputAudioContext) {
            outputAudioContext.close().catch(() => {});
            outputAudioContext = null;
        }

        sessionStarted.value = false;
        liveSession.value = null;
        isMicrophoneMuted.value = false;
        connState.value = 'closed';
        return { success: true };
    }

    function sendMessage(message: string) {
        if (!session) {
            throw new Error('No active Gemini session');
        }
        try {
            console.log('[gemini-live] sending message via realtimeInput.text', message.slice(0, 80));
            session.sendRealtimeInput({ text: message } as any);
        } catch (error) {
            console.error('Failed to send Gemini message:', error);
        }
    }

    function triggerConversation(message: string) {
        if (!session) {
            console.warn('[gemini-live] triggerConversation: no session yet');
            throw new Error('No active Gemini session');
        }
        try {
            console.log('[gemini-live] sending trigger via realtimeInput.text', message.slice(0, 80));
            // For audio-output models (like gemini-*-flash-live-preview) the
            // realtimeInput path triggers an immediate model turn. sendClientContent
            // sometimes only prefills context without producing a response when the
            // model is in audio-only mode, so prefer realtimeInput for nudges.
            session.sendRealtimeInput({ text: message } as any);
        } catch (error) {
            console.error('Failed to trigger Gemini conversation:', error);
        }
    }

    function toggleMicrophone(active?: boolean) {
        if (active !== undefined) {
            if (microphoneTrack) {
                isMicrophoneMuted.value = !active;
                microphoneTrack.enabled = active;
            }
        } else if (microphoneTrack) {
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

    // ----- Internals: audio -----

    async function setupAudio() {
        // Output context — receives 24kHz PCM frames and schedules them for playback.
        outputAudioContext = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
        await outputAudioContext.resume();
        nextStartTime = outputAudioContext.currentTime;

        // Input context — captures mic and downsamples to 16kHz Int16 in the worklet.
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

        // The browser only schedules an AudioWorkletProcessor's `process()`
        // when its output is connected to a sink. Route the worklet through a
        // muted GainNode to the destination so the processor actually runs,
        // without producing any audible output.
        const silentGain = inputAudioContext.createGain();
        silentGain.gain.value = 0;
        workletNode.connect(silentGain).connect(inputAudioContext.destination);

        console.log('[gemini-live] mic pipeline ready', {
            inputCtxState: inputAudioContext.state,
            inputSampleRate: inputAudioContext.sampleRate,
            trackEnabled: microphoneTrack?.enabled,
        });
    }

    let micChunkCounter = 0;
    function handleWorkletMessage(e: MessageEvent) {
        if (!session) return;
        if (isMicrophoneMuted.value) return;
        if (connState.value !== 'ready' && connState.value !== 'recording') return;

        const int16: Int16Array = e.data;
        if (!int16 || int16.length === 0) return;

        const base64 = int16ToBase64(int16);
        try {
            session.sendRealtimeInput({
                audio: { data: base64, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
            });
            micChunkCounter += 1;
            // Log first chunk and then once per second (~50 chunks at 20ms cadence).
            if (micChunkCounter === 1 || micChunkCounter % 50 === 0) {
                console.log('[gemini-live] mic chunks sent', {
                    count: micChunkCounter,
                    bytes: int16.byteLength,
                });
            }
            if (connState.value === 'ready') connState.value = 'recording';
        } catch (err) {
            console.warn('Failed to send mic chunk', err);
        }
    }

    function playAudioChunk(base64: string) {
        if (!outputAudioContext) return;
        // Browsers may suspend the AudioContext if it was created outside a
        // direct user gesture; lazily resume each time so playback works.
        if (outputAudioContext.state === 'suspended') {
            outputAudioContext.resume().catch(() => {});
        }
        const bytes = base64ToBytes(base64);
        if (bytes.length < 2) return;

        // Interpret raw bytes as little-endian Int16.
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
            } catch (e) {}
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

        const liveConfig: any = {
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

        const modelName =
            liveSession.value?.model || 'gemini-3.1-flash-live-preview';
        console.log('[gemini-live] connecting', { model: modelName, hasResumeHandle: !!resumeHandle });

        // The SDK's connect promise resolves as soon as the socket opens —
        // BEFORE the server's `setupComplete` arrives. Any client message sent
        // in that window is silently dropped. We wait on a separate promise
        // resolved by the inbound `setupComplete` handler before declaring
        // ready.
        let resolveSetupComplete: () => void;
        let rejectSetupComplete: (err: unknown) => void;
        const setupCompletePromise = new Promise<void>((res, rej) => {
            resolveSetupComplete = res;
            rejectSetupComplete = rej;
        });

        const newSession = await ai.live.connect({
            model: modelName,
            config: liveConfig,
            callbacks: {
                onopen: () => {
                    console.log('[gemini-live] WS opened');
                },
                onmessage: (msg: LiveServerMessage) => {
                    if ((msg as any).setupComplete) {
                        resolveSetupComplete();
                    }
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
                onclose: (e: any) => {
                    console.log('[gemini-live] WS closed', e);
                    rejectSetupComplete?.(new Error('WebSocket closed before setup'));
                    if (connState.value !== 'resuming') {
                        connState.value = 'closed';
                        sessionStarted.value = false;
                    }
                },
            },
        });

        session = newSession;

        const timeoutMs = 10000;
        await Promise.race([
            setupCompletePromise,
            new Promise<void>((_, reject) =>
                setTimeout(
                    () => reject(new Error('setupComplete timed out')),
                    timeoutMs
                )
            ),
        ]);

        connState.value = 'ready';
        armResumeTimer();
        console.log('[gemini-live] session ready');
    }

    function armResumeTimer() {
        if (resumeTimeoutId) clearTimeout(resumeTimeoutId);
        resumeTimeoutId = setTimeout(() => {
            requestResume('preemptive').catch((err) =>
                console.error('Pre-emptive resume failed', err)
            );
        }, RESUME_PRE_EMPTIVE_MS);
    }

    async function requestResume(reason: 'goAway' | 'preemptive') {
        if (isResuming) return;
        if (!sessionStarted.value) return;
        if (!lastResumptionHandle) {
            // No handle yet — just close gracefully.
            console.warn(
                `Resume requested (${reason}) but no resumption handle is available; ending session.`
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
            // New ephemeral token for the next leg. `isResume: true` tells the
            // server not to consume another freemium session slot.
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

            // Close the old session AFTER we have a token, before opening the new
            // socket, so we don't double-bill any frames.
            const old = session;
            session = null;
            try {
                old?.close();
            } catch (e) {}

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
        // Notify the practice page of every event for any custom handling.
        onUpdateCallback?.(msg);

        const m: any = msg;

        // Diagnostic: dump the top-level shape of every inbound message so we
        // can see what the SDK is actually emitting.
        try {
            const keys = Object.keys(m).filter((k) => m[k] !== undefined);
            console.log('[gemini-live] <-', keys.join(','), m);
        } catch (e) {
            console.log('[gemini-live] <- (dump failed)', e);
        }

        if (m.setupComplete) {
            console.log('[gemini-live] setupComplete', m.setupComplete);
        }

        if (m.serverContent) {
            const sc = m.serverContent;

            if (sc.modelTurn?.parts) {
                let audioParts = 0;
                let textParts = 0;
                for (const part of sc.modelTurn.parts) {
                    if (part?.inlineData?.data) {
                        audioParts += 1;
                        playAudioChunk(part.inlineData.data);
                    }
                    if (part?.text) {
                        textParts += 1;
                        appendDialog(part.text, 'ai');
                    }
                }
                if (audioParts || textParts) {
                    console.log('[gemini-live] modelTurn parts', { audioParts, textParts });
                }
            }
            if (sc.outputTranscription?.text) {
                appendDialog(sc.outputTranscription.text, 'ai');
            }
            if (sc.inputTranscription?.text) {
                appendDialog(sc.inputTranscription.text, 'user');
            }
            if (sc.interrupted) {
                console.log('[gemini-live] interrupted');
                dropPlayback();
            }
            if (sc.turnComplete || sc.generationComplete) {
                console.log('[gemini-live]', sc.turnComplete ? 'turnComplete' : 'generationComplete');
                // Finalize current turn so the next chunk starts a new dialog row.
                currentUserDialogId = null;
                currentAiDialogId = null;
                turnCounter += 1;
                flushDialogToServer();
            }
        }

        if (m.toolCall?.functionCalls) {
            console.log('[gemini-live] toolCall', m.toolCall.functionCalls);
            handleToolCalls(m.toolCall.functionCalls);
        }

        if (m.usageMetadata) {
            const partial = mapGeminiUsage(m.usageMetadata);
            updateTokenUsageWithPartialData(partial);
        }

        if (m.sessionResumptionUpdate?.newHandle) {
            lastResumptionHandle = m.sessionResumptionUpdate.newHandle;
        }

        if (m.goAway) {
            console.log('[gemini-live] goAway', m.goAway);
            connState.value = 'goingAway';
            onUpdateCallback?.({ type: 'goAway', timeLeft: m.goAway.timeLeft });
            requestResume('goAway').catch((err) =>
                console.error('Resume on goAway failed', err)
            );
        }
    }

    function handleToolCalls(functionCalls: any[]) {
        if (!session || !sessionTools) return;
        const responses: any[] = [];
        for (const call of functionCalls) {
            const name = call.name as string;
            const args = call.args || {};
            const tool = sessionTools[name];
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
            responses.push({
                id: call.id,
                name,
                response: { output: result },
            });
        }
        try {
            session.sendToolResponse({ functionResponses: responses });
        } catch (err) {
            console.warn('Failed to send Gemini tool response', err);
        }
    }

    // ----- Internals: dialog accumulation + persistence -----

    function appendDialog(text: string, speaker: 'user' | 'ai') {
        if (!text) return;
        const idKey = speaker === 'user' ? 'currentUserDialogId' : 'currentAiDialogId';
        let dialogId = speaker === 'user' ? currentUserDialogId : currentAiDialogId;

        if (!dialogId) {
            dialogId = `${speaker}-${turnCounter}-${Date.now()}`;
            if (speaker === 'user') currentUserDialogId = dialogId;
            else currentAiDialogId = dialogId;
            conversationDialogs.value.push({ id: dialogId, content: text, speaker });
        } else {
            const idx = conversationDialogs.value.findIndex((d) => d.id === dialogId);
            if (idx === -1) {
                conversationDialogs.value.push({ id: dialogId, content: text, speaker });
            } else {
                conversationDialogs.value[idx].content += text;
            }
        }
    }

    function flushDialogToServer() {
        if (!id.value) return;
        const total = conversationDialogs.value.length;
        if (total === 0) return;
        const lastDialog = conversationDialogs.value[total - 1];
        functionProvider
            .run({
                name: 'update-live-session-record',
                args: {
                    sessionId: id.value,
                    userId: authUser.value?.id,
                    provider: 'gemini',
                    update: { totalUsage: tokenUsage.value, dialogs: [lastDialog] },
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
            prompt_tokens_details: { text_tokens: 0, audio_tokens: 0, image_tokens: 0 },
            response_tokens_details: { text_tokens: 0, audio_tokens: 0 },
            cached_tokens: 0,
            cached_tokens_details: { text_tokens: 0, audio_tokens: 0 },
        };
    }

    function mapGeminiUsage(usageMetadata: any): GeminiTokenUsageType {
        const prompt = usageMetadata.promptTokenCount || 0;
        const response =
            usageMetadata.responseTokenCount || usageMetadata.candidatesTokenCount || 0;
        const total =
            usageMetadata.totalTokenCount ||
            prompt + response + (usageMetadata.cachedContentTokenCount || 0);

        const out: GeminiTokenUsageType = emptyUsage();
        out.prompt_tokens = prompt;
        out.response_tokens = response;
        out.total_tokens = total;
        out.cached_tokens = usageMetadata.cachedContentTokenCount || 0;

        const promptDetails = usageMetadata.promptTokensDetails || [];
        for (const d of promptDetails) {
            const c = d.tokenCount || 0;
            const mod = String(d.modality || '').toUpperCase();
            if (mod === 'TEXT') out.prompt_tokens_details.text_tokens += c;
            else if (mod === 'AUDIO') out.prompt_tokens_details.audio_tokens += c;
            else if (mod === 'IMAGE' || mod === 'VIDEO')
                out.prompt_tokens_details.image_tokens += c;
        }
        const responseDetails =
            usageMetadata.responseTokensDetails ||
            usageMetadata.candidatesTokensDetails ||
            [];
        for (const d of responseDetails) {
            const c = d.tokenCount || 0;
            const mod = String(d.modality || '').toUpperCase();
            if (mod === 'TEXT') out.response_tokens_details.text_tokens += c;
            else if (mod === 'AUDIO') out.response_tokens_details.audio_tokens += c;
        }
        const cachedDetails = usageMetadata.cachedContentTokensDetails || [];
        for (const d of cachedDetails) {
            const c = d.tokenCount || 0;
            const mod = String(d.modality || '').toUpperCase();
            if (mod === 'TEXT') out.cached_tokens_details.text_tokens += c;
            else if (mod === 'AUDIO') out.cached_tokens_details.audio_tokens += c;
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
        t.prompt_tokens_details.text_tokens += partialUsage.prompt_tokens_details.text_tokens;
        t.prompt_tokens_details.audio_tokens += partialUsage.prompt_tokens_details.audio_tokens;
        t.prompt_tokens_details.image_tokens += partialUsage.prompt_tokens_details.image_tokens;
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
