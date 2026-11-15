/**
 * Google Cloud Text-to-Speech, shared by `textToSpeechBase64` and the starter pack audio
 * script (B-22). Returns the MP3 bytes.
 */
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

export interface SpeechRequest {
  text: string;
  languageCode: string;
  voiceName: string;
  speakingRate?: number;
}

export async function synthesizeSpeech({ text, languageCode, voiceName, speakingRate = 1.0 }: SpeechRequest): Promise<Buffer> {
  const client = new TextToSpeechClient({ apiKey: process.env.GCP_API_KEY });
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode, name: voiceName },
    audioConfig: { audioEncoding: "MP3", speakingRate },
  } as any);

  if (!response.audioContent) throw new Error("No audio content returned from TTS");
  if (response.audioContent instanceof Uint8Array) return Buffer.from(response.audioContent);
  if (typeof response.audioContent === "string") return Buffer.from(response.audioContent, "binary");
  throw new Error("Invalid audio content format");
}
