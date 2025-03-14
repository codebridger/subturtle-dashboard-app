import { defineStore } from 'pinia';
import { functionProvider } from '@modular-rest/client';
import type { ConversationDialogType, LiveSessionType } from '~/types/live-session.type';

export const useLiveSessionStore = defineStore('liveSession', () => {
	// State
	const liveSession = ref<LiveSessionType | null>(null);
	const sessionStarted = ref(false);
	const conversationDialogs = ref<ConversationDialogType[]>([]);

	// RTCPeerConnection state
	let peerConnection: RTCPeerConnection | null = null;
	let dataChannel: RTCDataChannel | null = null;
	let audioElement: HTMLAudioElement | null = null;

	// Custom callback function that will be called on session events
	let onUpdateCallback: ((data: any) => void) | null = null;
	let sessionTools: { [key: string]: any } | null = null;

	// Getters
	const isSessionActive = computed(() => sessionStarted.value);
	const getConversationDialogs = computed(() => conversationDialogs.value);

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
			model?: string;
			turnDetectionSilenceDuration?: number;
		};
		tools: { [key: string]: any };
		onUpdate?: (data: any) => void;
		audioRef: HTMLAudioElement | null;
	}) {
		const { sessionDetails, tools, onUpdate, audioRef } = options;

		// Store the tools and callback
		sessionTools = tools;
		onUpdateCallback = onUpdate || null;
		audioElement = audioRef;

		try {
			// Create the session
			const session = await functionProvider.run<LiveSessionType>({
				name: 'create-practice-live-session',
				args: {
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

			// Set up RTP and start the session
			await setupRTP();
			await startLiveSession();

			return { success: true, session };
		} catch (error) {
			console.error('Failed to create live session:', error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Sets up the WebRTC peer connection
	 */
	async function setupRTP() {
		if (!audioElement) {
			console.error('Audio element not provided');
			return;
		}

		// Create a peer connection
		peerConnection = new RTCPeerConnection();

		// Set up to play remote audio from the model
		audioElement.autoplay = true;
		peerConnection.ontrack = (e) => {
			if (audioElement) audioElement.srcObject = e.streams[0];
		};

		// Add local audio track for microphone input in the browser
		const ms = await navigator.mediaDevices.getUserMedia({
			audio: true,
		});

		peerConnection.addTrack(ms.getTracks()[0]);
	}

	/**
	 * Starts the live session after RTP is set up
	 */
	async function startLiveSession() {
		if (liveSession.value === null) {
			console.error('No active session to start');
			return;
		}

		if (peerConnection === null) {
			console.error('Peer connection not set up');
			return;
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
			updateConversationDialogs(transcript, item_id, 'user');
		}

		// Handle function calls
		else if (type === 'response.done' && eventData.response.output) {
			const [output01] = eventData.response.output;

			if (!output01) return;

			if (output01.type != undefined && output01.type == 'function_call') {
				onFunctionCall(eventData);
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
		sessionStarted.value = false;
		liveSession.value = null;

		// Clear conversation dialogs?
		// conversationDialogs.value = [];

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
		let fnResponse: { success: boolean, [key: string]: any } = { success: false };

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
			console.error('No data channel available to send message');
			return;
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
	 * Updates the conversation dialogs
	 */
	function updateConversationDialogs(content: string, id: string, speaker: 'user' | 'ai') {
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

	return {
		// State
		liveSession,
		sessionStarted,
		conversationDialogs,

		// Getters
		isSessionActive,
		getConversationDialogs,

		// Actions
		createLiveSession,
		endLiveSession,
		triggerConversation,
		clearConversationDialogs,
	};
});
