import { ref } from 'vue';

/**
 * Global "you hit a plan limit" modal state.
 *
 * Module-level singleton refs (the app is a SPA — no SSR — so a shared module
 * ref is safe and simple). The modular-rest axios interceptor opens this from a
 * NON-Vue/Pinia context, which is exactly why this is a plain ref and not a Pinia
 * store: it's readable/writable from anywhere without an active Pinia. The single
 * LimitationModal in the default layout binds to these.
 */
const open = ref(false);
const feature = ref('');

/** Open the global limit modal, tagged with the gated feature (tailors the copy). */
export function openTierLimitModal(featureName = '') {
    feature.value = featureName;
    open.value = true;
}

/** Close the global limit modal. */
export function closeTierLimitModal() {
    open.value = false;
    feature.value = '';
}

export function useTierLimitModal() {
    return { open, feature, openTierLimitModal, closeTierLimitModal };
}
