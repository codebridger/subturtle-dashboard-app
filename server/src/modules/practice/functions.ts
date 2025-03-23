import { defineFunction } from "@modular-rest/server";
const fetch = require("node-fetch");

interface PracticeSetup {
	instructions?: string;
	voice?: string;
	turn_detection?: boolean;
	tools?: any[];
	tool_choice?: string;
}

interface EphemeralToken {
	token: string;
	expires_in: number;
}

const createPracticeLiveSession = defineFunction({
	name: "create-practice-live-session",
	permissionTypes: ["user_access"],
	callback: async function (setup: PracticeSetup): Promise<EphemeralToken> {
		const validSetupKeys = [
			"instructions",
			"voice",
			"turn_detection",
			"tools",
			"tool_choice",
		] as const;

		const additionalSetup: Partial<PracticeSetup> = {};
		for (const key of validSetupKeys) {
			if (setup[key]) {
				(additionalSetup as any)[key] = setup[key];
			}
		}

		try {
			// https://platform.openai.com/docs/guides/realtime-webrtc#creating-an-ephemeral-token
			// https://platform.openai.com/docs/api-reference/realtime-sessions/create
			const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "gpt-4o-mini-realtime-preview",
					temperature: 0.6,
					input_audio_transcription: {
						model: "whisper-1",
					},
					...additionalSetup,
				}),
			});

			if (r.status < 200 || r.status >= 299) {
				const body = await r.json().then((data: any) => console.error(data));
				console.error("Failed to create practice live session", body);
				throw new Error(
					`Failed to create practice live session, Openai status: ${r.status}`
				);
			}

			const ephemeralToken = await r.json() as EphemeralToken;
			return ephemeralToken;
		} catch (error) {
			throw new Error("Failed to create practice live session");
		}
	},
});

export const functions = [createPracticeLiveSession]; 