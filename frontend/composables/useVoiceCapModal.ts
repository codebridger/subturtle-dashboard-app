import { ref } from 'vue';
import type { LiveSessionRequest } from '~/types/live-session-request';

/**
 * Global state for the 100% voice-cap modal (Council 004 Surface 4). Opened from any
 * "Start voice chat" entry point when a paid user has 0 voice minutes left — a
 * DEDICATED modal (top-up / use-text-chat), not the generic tier-limit modal. A
 * module-level ref so any call site can open it without prop drilling; the single
 * VoiceCapModal in the default layout binds to it.
 */
const open = ref(false);
const request = ref<LiveSessionRequest | null>(null);

/** Open the voice-cap modal. Pass the session request the caller was about to start
 *  so "Use text chat instead" can start it as text on the same phrases. */
export function openVoiceCapModal(opts: { request?: LiveSessionRequest | null } = {}) {
    request.value = opts.request ?? null;
    open.value = true;
}

export function closeVoiceCapModal() {
    open.value = false;
}

export function useVoiceCapModal() {
    return { open, request, openVoiceCapModal, closeVoiceCapModal };
}
