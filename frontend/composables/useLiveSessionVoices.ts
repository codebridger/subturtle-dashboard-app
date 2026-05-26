import { ref } from 'vue';
import { functionProvider } from '@modular-rest/client';
import type { CoachVoice } from '~/types/live-session.type';

/**
 * Shared, cached fetch of the AI-coach voice list from the server
 * (`get-live-session-voices`). Module-level state means every caller — the
 * bundle Live Session form and the Practice now surfaces — shares one fetch and
 * one identical list. Call `ensureLoaded()` from `onMounted`.
 */
const voices = ref<CoachVoice[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let inflight: Promise<void> | null = null;

export function useLiveSessionVoices() {
  function ensureLoaded() {
    if (voices.value.length) return Promise.resolve();
    if (inflight) return inflight;

    loading.value = true;
    error.value = null;
    inflight = functionProvider
      .run<CoachVoice[]>({ name: 'get-live-session-voices', args: {} })
      .then((res) => {
        voices.value = res || [];
      })
      .catch((e: any) => {
        error.value = e?.error || e?.message || 'Failed to load voices';
      })
      .finally(() => {
        loading.value = false;
        inflight = null;
      });
    return inflight;
  }

  return { voices, loading, error, ensureLoaded };
}
