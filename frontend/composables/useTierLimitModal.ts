import { ref, onUnmounted } from 'vue';

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

// Features whose lock is rendered INLINE as a FeatureLocked card on their own
// page (session_history on /sessions, weekly_insights on /statistic). While such
// a page is mounted it owns the upsell, so the global modal defers — otherwise
// the page-load probe that returns the lock stacks the modal on top of the card.
const inlineLockedFeatures = new Set<string>();

/** Open the global limit modal, tagged with the gated feature (tailors the copy). */
export function openTierLimitModal(featureName = '') {
    // Defer to an inline FeatureLocked card if the active page renders one for
    // this feature — no double upsell (modal + card).
    if (featureName && inlineLockedFeatures.has(featureName)) return;
    feature.value = featureName;
    open.value = true;
}

/** Close the global limit modal. */
export function closeTierLimitModal() {
    open.value = false;
    feature.value = '';
}

/**
 * Declare that the current page renders `featureKey`'s lock inline (a
 * FeatureLocked card), so the global tier-limit modal suppresses itself for that
 * feature while the page is mounted. Call once in setup — registering there (not
 * onMounted) guarantees it lands before the page's gated RPC resolves, so the
 * modal never flashes. Auto-cleans on unmount.
 */
export function useInlineFeatureLock(featureKey: string) {
    if (featureKey) inlineLockedFeatures.add(featureKey);
    onUnmounted(() => {
        if (featureKey) inlineLockedFeatures.delete(featureKey);
    });
}

export function useTierLimitModal() {
    return { open, feature, openTierLimitModal, closeTierLimitModal };
}
