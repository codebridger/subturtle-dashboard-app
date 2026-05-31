import { ref } from 'vue';

/**
 * Global state for the 100% voice-cap modal (Council 004 Surface 4). Opened from any
 * "Start voice chat" entry point when a paid user has 0 voice minutes left — a
 * DEDICATED modal (top-up / use-text-chat), not the generic tier-limit modal. A
 * module-level ref so any call site can open it without prop drilling; the single
 * VoiceCapModal in the default layout binds to it.
 */
const open = ref(false);
const phraseId = ref<string | null>(null);

/** Open the voice-cap modal, optionally preserving a saved-phrase context to pass
 *  through to text chat if the user falls back. */
export function openVoiceCapModal(opts: { phraseId?: string | null } = {}) {
    phraseId.value = opts.phraseId ?? null;
    open.value = true;
}

export function closeVoiceCapModal() {
    open.value = false;
}

export function useVoiceCapModal() {
    return { open, phraseId, openVoiceCapModal, closeVoiceCapModal };
}
