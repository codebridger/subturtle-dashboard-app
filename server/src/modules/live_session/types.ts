export type SessionType = "bundle-practice";

export interface LiveSessionRecordType {
	_id: string;
	type: SessionType;
	session: LiveSessionType;
	refId: string;
	createdAt: Date;
	updatedAt: Date;
	usage: TokenUsageType;
	dialogs: ConversationDialogType[];
}

export interface LiveSessionType {
	id: string;
	object: string;
	model: string;
	expires_at: number;
	modalities: string[];
	instructions: string;
	voice: string;
	turn_detection: TurnDetectionType;
	input_audio_format: string;
	output_audio_format: string;
	input_audio_transcription: any;
	tool_choice: string;
	temperature: number;
	max_response_output_tokens: string;
	client_secret: ClientSecretType;
	tools: any[];
}

export interface TurnDetectionType {
	type: string;
	threshold: number;
	prefix_padding_ms: number;
	silence_duration_ms: number;
	create_response: boolean;
	interrupt_response: boolean;
}

export interface ClientSecretType {
	value: string;
	expires_at: number;
}

export interface ConversationDialogType {
	id: string;
	content: string;
	speaker: "user" | "ai";
}

export interface TokenUsageType {
	total_tokens: number;
	input_tokens: number;
	output_tokens: number;
	input_token_details: {
		cached_tokens: number;
		text_tokens: number;
		audio_tokens: number;
		cached_tokens_details: {
			text_tokens: number;
			audio_tokens: number;
		};
	};
	output_token_details: {
		text_tokens: number;
		audio_tokens: number;
	};
}
