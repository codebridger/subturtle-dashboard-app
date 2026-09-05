import { ref } from 'vue';
import { functionProvider } from '@modular-rest/client';

/**
 * Short spoken sample for a coach voice, behind the picker's "Preview" pill.
 *
 * The Gemini Live prebuilt voices (Kore, Puck, …) are not addressable outside a live
 * session — there is no endpoint that renders one to a file — so a sample is synthesised
 * through the existing `textToSpeechBase64` function with the closest Google voice per
 * coach. It conveys the tone the description promises; it is NOT the exact voice the
 * session will use. Swap MAP for real per-coach clips as soon as any exist.
 */
const GOOGLE_VOICE_BY_COACH: Record<string, string> = {
    Kore: 'en-US-Neural2-C',
    Puck: 'en-US-Neural2-D',
    Charon: 'en-US-Neural2-A',
    Fenrir: 'en-US-Neural2-I',
    Aoede: 'en-US-Neural2-F',
    Leda: 'en-US-Neural2-G',
    Orus: 'en-US-Neural2-J',
    Zephyr: 'en-US-Neural2-H',
};

const SAMPLE_TEXT = "Hi, I'm your coach. Ready when you are.";

// Module-level so only one sample can play at a time, and a second click on the
// playing card stops it rather than layering a second voice on top.
const playing = ref<string | null>(null);
const loading = ref<string | null>(null);
let audio: HTMLAudioElement | null = null;
const cache = new Map<string, string>();

export function useVoicePreview() {
    function stop() {
        audio?.pause();
        audio = null;
        playing.value = null;
    }

    async function preview(coach: string) {
        if (playing.value === coach) return stop();
        stop();

        const voiceName = GOOGLE_VOICE_BY_COACH[coach];
        if (!voiceName) return;

        try {
            let src = cache.get(coach);
            if (!src) {
                loading.value = coach;
                const res = await functionProvider.run<any>({
                    name: 'textToSpeechBase64',
                    args: { text: SAMPLE_TEXT, languageCode: 'en-US', voiceName },
                });
                const base64 = typeof res === 'string' ? res : res?.audioContent || res?.audioContentBase64;
                if (!base64) return;
                src = `data:audio/mp3;base64,${base64}`;
                cache.set(coach, src);
            }

            audio = new Audio(src);
            playing.value = coach;
            audio.onended = () => {
                if (playing.value === coach) playing.value = null;
            };
            await audio.play();
        } catch (e) {
            console.error('voice preview failed', e);
            playing.value = null;
        } finally {
            loading.value = null;
        }
    }

    return { preview, stop, playing, loading };
}
