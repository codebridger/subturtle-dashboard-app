import { defineStore } from 'pinia';
import { functionProvider } from '@modular-rest/client';
import type { ConversationDialogType, LiveSessionMetadataType, LiveSessionRecordType, LiveSessionType, TokenUsageType } from '~/types/live-session.type';

export const useLiveSessionStore = defineStore('liveSession', () => {
    // State
    const id = ref<string | null>(null);
    const liveSession = ref<LiveSessionType | null>(null);
    const sessionStarted = ref(false);
    const conversationDialogs = ref<ConversationDialogType[]>([]);
    const isMicrophoneMuted = ref(false);
    const tokenUsage = ref<TokenUsageType | null>(null);
    const metadata = ref<LiveSessionMetadataType | null>(null);
    const latestResponseEventId = ref<string | null>(null);

    // RTCPeerConnection state
    let peerConnection: RTCPeerConnection | null = null;
    let dataChannel: RTCDataChannel | null = null;
    let audioElement: HTMLAudioElement | null = null;
    let microphoneStream: MediaStream | null = null;
    let microphoneTrack: MediaStreamTrack | null = null;

    // Custom callback function that will be called on session events
    let onUpdateCallback: ((data: any) => void) | null = null;
    let sessionTools: { [key: string]: any } | null = null;

    // Getters
    const isSessionActive = computed(() => sessionStarted.value);
    const getConversationDialogs = computed(() => conversationDialogs.value);
    const getMicrophoneMuted = computed(() => isMicrophoneMuted.value);

    // Actions
    /**
     * Creates a new live session
     * @param options Session creation options
     * @returns Promise that resolves when session is created and RTP is set up
     */
    async function createLiveSession(options: {
        sessionDetails: {
            instructions: string;
            voice?: string;
            turnDetectionSilenceDuration?: number;
        };
        metadata?: LiveSessionMetadataType;
        tools: { [key: string]: any };
        onUpdate?: (data: any) => void;
        audioRef: HTMLAudioElement | null;
    }) {
        const { sessionDetails, tools, onUpdate, audioRef } = options;

        // Store the tools and callback
        sessionTools = tools;
        onUpdateCallback = onUpdate || null;
        audioElement = audioRef;
        metadata.value = options.metadata || null;

        try {
            // Create the session
            const session = await functionProvider.run<LiveSessionType>({
                name: 'request-live-session-ephemeral-token',
                args: {
                    userId: authUser.value?.id,
                    voice: sessionDetails.voice || 'alloy',
                    instructions: sessionDetails.instructions,
                    tools: Object.values(tools).map((t) => t.definition),
                    tool_choice: 'auto',
                    turn_detection: {
                        type: 'server_vad',
                        silence_duration_ms: sessionDetails.turnDetectionSilenceDuration || 1000,
                    },
                },
            });

            liveSession.value = session;
            await createLiveSessionRecordOnServer();

            // Set up RTP and start the session
            await setupRTP();
            await startLiveSession();

            // mute the microphone
            toggleMicrophone(false);

            return { success: true, session };
        } catch (error) {
            console.error('Failed to create live session:', error);
            throw error;
        }
    }

    /**
     * Sets up the WebRTC peer connection
     */
    async function setupRTP() {
        if (!audioElement) {
            throw new Error('Audio element not provided');
        }

        // Create a peer connection
        peerConnection = new RTCPeerConnection();

        // Set up to play remote audio from the model
        audioElement.autoplay = true;
        peerConnection.ontrack = (e) => {
            if (audioElement) audioElement.srcObject = e.streams[0];
        };

        // Add local audio track for microphone input in the browser
        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
        });
        microphoneTrack = microphoneStream.getTracks()[0];
        peerConnection.addTrack(microphoneTrack);
    }

    /**
     * Starts the live session after RTP is set up
     */
    async function startLiveSession() {
        if (liveSession.value === null) {
            throw new Error('No active session to start');
        }

        if (peerConnection === null) {
            throw new Error('Peer connection not set up');
        }

        // Set up data channel for sending and receiving events
        dataChannel = peerConnection.createDataChannel('oai-events');

        dataChannel.addEventListener('message', (e) => {
            // Realtime server events appear here!
            const data = JSON.parse(e.data);
            onSessionEvent(data);
        });

        // Start the session using the Session Description Protocol (SDP)
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const baseUrl = 'https://api.openai.com/v1/realtime';
        const model = liveSession.value.model;
        const EPHEMERAL_KEY = liveSession.value.client_secret.value;

        const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
            method: 'POST',
            body: offer.sdp,
            headers: {
                Authorization: `Bearer ${EPHEMERAL_KEY}`,
                'Content-Type': 'application/sdp',
            },
        });

        const answer = {
            type: 'answer',
            sdp: await sdpResponse.text(),
        };

        await peerConnection.setRemoteDescription(answer as any);
        sessionStarted.value = true;
    }

    /**
     * Handles various session events
     */
    function onSessionEvent(eventData: any) {
        // Call the update callback if provided
        if (onUpdateCallback) {
            onUpdateCallback(eventData);
        }

        // Ref: https://platform.openai.com/docs/api-reference/realtime-server-events
        const { type, event_id } = eventData;

        if (type === 'session.created') {
            console.log('Session created', event_id);
            // Can trigger initial conversation here if needed
        }

        // on model speech transcription
        else if (type === 'response.audio_transcript.delta') {
            const { delta, response_id } = eventData;
            updateConversationDialogs(delta, response_id, 'ai');
        }

        // on user speech transcription
        else if (type == 'conversation.item.input_audio_transcription.completed') {
            const { item_id, transcript } = eventData;

            if (transcript) {
                updateConversationDialogs(transcript, item_id, 'user');
                updateLiveSessionRecordOnServer();
            }
        } else if (type === 'response.created') {
            latestResponseEventId.value = event_id;
        }

        // Handle function calls
        else if (type === 'response.done' && eventData.response.output) {
            const [output01] = eventData.response.output;

            if (!output01) return;

            if (output01.type != undefined && output01.type == 'function_call') {
                onFunctionCall(eventData);
            }

            if (eventData.response.usage) {
                updateTokenUsageWithPartialData(eventData.response.usage);
                updateLiveSessionRecordOnServer();
            }
        }

        // Error handling
        else if (type === 'error') {
            console.error('Error from AI', eventData);
        }
    }

    /**
     * Ends the active live session
     */
    function endLiveSession() {
        if (peerConnection === null) {
            console.warn('No active peer connection to close');
            return { success: false, message: 'No active session' };
        }

        peerConnection.close();
        peerConnection = null;
        dataChannel = null;

        // Clean up microphone resources
        if (microphoneTrack) {
            microphoneTrack.stop();
            microphoneTrack = null;
        }
        if (microphoneStream) {
            microphoneStream.getTracks().forEach((track) => track.stop());
            microphoneStream = null;
        }

        sessionStarted.value = false;
        liveSession.value = null;
        isMicrophoneMuted.value = false;

        return { success: true };
    }

    /**
     * Handles function calls from the model
     */
    function onFunctionCall(eventData: any) {
        if (!sessionTools || !dataChannel) return;

        const [output01] = eventData.response.output;
        console.log('Function call', output01);

        const functionName = output01.name as string;
        const args = JSON.parse(output01.arguments);

        const fn = sessionTools[functionName];
        let fnResponse: { success: boolean; [key: string]: any } = { success: false };

        if (!fn) {
            console.error(`Function ${functionName} not found in tools`);
            fnResponse = { success: false, message: `Function ${functionName} not found` };
        } else {
            try {
                fnResponse = fn.handler(args);
            } catch (error) {
                console.error('Error calling function', functionName, error);
                fnResponse = { success: false, message: String(error) };
            }
        }

        const response = {
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: output01.call_id,
                output: JSON.stringify(fnResponse),
            },
        };

        if (!dataChannel) {
            // maybe the session is finished or not started yet
            // dont throw error here, just return
            return;
        }

        dataChannel.send(JSON.stringify(response));

        // Continue the conversation
        const continueResponse = {
            type: 'response.create',
        };

        dataChannel.send(JSON.stringify(continueResponse));
    }

    /**
     * Trigger initial conversation with the model
     */
    function triggerConversation(message: string) {
        if (!dataChannel) {
            throw new Error('No data channel available to send message');
        }

        const responseCreate = {
            type: 'response.create',
            response: {
                modalities: ['text', 'audio'],
                instructions: message,
            },
        };

        dataChannel.send(JSON.stringify(responseCreate));
    }

    /**
     * Send a message to the AI
     */
    function sendMessage(message: string) {
        if (!dataChannel) {
            throw new Error('No data channel available to send message');
        }

        const responseCreate = {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text: message,
                    },
                ],
            },
        };

        cancelTheAIInProgressResponse();
        dataChannel.send(JSON.stringify(responseCreate));
        triggerConversation('');
    }

    /**
     * Truncate the AI conversation
     */
    function cancelTheAIInProgressResponse() {
        if (!dataChannel) {
            throw new Error('No data channel available to truncate the AI conversation');
        }

        const cancelEvent = {
            type: 'response.cancel',
            event_id: latestResponseEventId.value,
        };

        dataChannel.send(JSON.stringify(cancelEvent));

        const stopAudioEvent = {
            type: 'output_audio_buffer.clear',
            event_id: latestResponseEventId.value,
        };

        dataChannel.send(JSON.stringify(stopAudioEvent));
    }

    /**
     * Send a function call to the AI
     */
    function sendFunctionCall(functionName: string, arguments_: any) {
        if (!dataChannel) {
            throw new Error('No data channel available to send function call');
        }

        const functionCall = {
            type: 'conversation.item.create',
            item: {
                type: 'function_call',
                name: functionName,
                arguments: JSON.stringify(arguments_),
            },
        };

        dataChannel.send(JSON.stringify(functionCall));

        // Continue the conversation
        const continueResponse = {
            type: 'response.create',
        };

        dataChannel.send(JSON.stringify(continueResponse));
    }

    /**
     * Updates the conversation dialogs
     */
    function updateConversationDialogs(content: string, id: string, speaker: 'user' | 'ai') {
        // console.log('updateConversationDialogs', id, speaker, content);

        const index = conversationDialogs.value.findIndex((d) => d.id === id);
        if (index === -1) {
            conversationDialogs.value.push({ id, content, speaker });
        } else {
            conversationDialogs.value[index].content += content;
        }
    }

    /**
     * Clears all conversation dialogs
     */
    function clearConversationDialogs() {
        conversationDialogs.value = [];
    }

    /**
     * Toggles the microphone mute state
     * @returns The new mute state
     */
    function toggleMicrophone(active?: boolean) {
        if (active !== undefined) {
            if (microphoneTrack) {
                isMicrophoneMuted.value = true;
                microphoneTrack.enabled = false;
            }
        } else if (microphoneTrack) {
            isMicrophoneMuted.value = !isMicrophoneMuted.value;
            microphoneTrack.enabled = !isMicrophoneMuted.value;
        }

        return isMicrophoneMuted.value;
    }

    function updateTokenUsageWithPartialData(partialUsage: TokenUsageType) {
        if (!tokenUsage.value) {
            tokenUsage.value = {
                total_tokens: 0,
                input_tokens: 0,
                output_tokens: 0,
                input_token_details: {
                    cached_tokens: 0,
                    text_tokens: 0,
                    audio_tokens: 0,
                    cached_tokens_details: {
                        text_tokens: 0,
                        audio_tokens: 0,
                    },
                },
                output_token_details: {
                    text_tokens: 0,
                    audio_tokens: 0,
                },
            };
        }

        // Accumulate top-level token counts
        tokenUsage.value.total_tokens += partialUsage.total_tokens;
        tokenUsage.value.input_tokens += partialUsage.input_tokens;
        tokenUsage.value.output_tokens += partialUsage.output_tokens;

        // Accumulate input token details
        tokenUsage.value.input_token_details.cached_tokens += partialUsage.input_token_details.cached_tokens;
        tokenUsage.value.input_token_details.text_tokens += partialUsage.input_token_details.text_tokens;
        tokenUsage.value.input_token_details.audio_tokens += partialUsage.input_token_details.audio_tokens;
        tokenUsage.value.input_token_details.cached_tokens_details.text_tokens += partialUsage.input_token_details.cached_tokens_details.text_tokens;
        tokenUsage.value.input_token_details.cached_tokens_details.audio_tokens += partialUsage.input_token_details.cached_tokens_details.audio_tokens;

        // Accumulate output token details
        tokenUsage.value.output_token_details.text_tokens += partialUsage.output_token_details.text_tokens;
        tokenUsage.value.output_token_details.audio_tokens += partialUsage.output_token_details.audio_tokens;

        // Update the live session record on the server
        return functionProvider.run({
            name: 'update-live-session-record',
            args: {
                sessionId: id.value,
                userId: authUser.value?.id,
                update: { partialUsage },
            },
        });
    }

    function createLiveSessionRecordOnServer() {
        return functionProvider
            .run<LiveSessionRecordType>({
                name: 'create-live-session-record',
                args: {
                    type: 'bundle-practice',
                    userId: authUser.value?.id,
                    session: liveSession.value,
                    metadata: metadata.value,
                },
            })
            .then((res) => {
                id.value = res._id;
            });
    }

    function updateLiveSessionRecordOnServer() {
        if (!id.value) {
            throw new Error('No live session record id found');
        }

        const totalDialogs = conversationDialogs.value.length;
        const lastDialog = totalDialogs > 0 ? conversationDialogs.value[totalDialogs - 1] : null;

        return functionProvider.run({
            name: 'update-live-session-record',
            args: {
                sessionId: id.value,
                userId: authUser.value?.id,
                update: { totalUsage: tokenUsage.value, dialogs: [lastDialog] },
            },
        });
    }

    return {
        // State
        liveSession,
        sessionStarted,
        conversationDialogs,
        isMicrophoneMuted,
        tokenUsage,

        // Getters
        isSessionActive,
        getConversationDialogs,
        getMicrophoneMuted,

        // Actions
        createLiveSession,
        endLiveSession,
        triggerConversation,
        sendMessage,
        sendFunctionCall,
        cancelTheAIInProgressResponse,
        clearConversationDialogs,
        toggleMicrophone,
    };
});
