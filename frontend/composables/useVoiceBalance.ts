import { computed } from 'vue';
import { useProfileStore } from '~/stores/profile';

/**
 * Derived voice-minute balance read from the profile store (Council 004). Base is
 * the tier's monthly grant (entitlement snapshot); top-up packs are tracked apart,
 * so `remaining` = base remaining + non-expired top-up remaining. Shared by the
 * meter, the 80% banner, the 100% modal, and the start-voice-chat gate.
 */
export function useVoiceBalance() {
    const profileStore = useProfileStore();

    const isFreemium = computed(() => profileStore.isFreemium);
    const sub = computed(() => profileStore.activeSubscription as any);
    const free = computed(() => profileStore.freemiumAllocation as any);
    const tier = computed<string>(() => (isFreemium.value ? 'starter' : sub.value?.tier ?? 'starter'));

    const base = computed<number>(() =>
        isFreemium.value ? free.value?.voice_minutes_total ?? 0 : sub.value?.entitlements?.voiceMinutesGranted ?? sub.value?.voice_minutes_total ?? 0
    );
    const used = computed<number>(() => (isFreemium.value ? free.value?.voice_minutes_used : sub.value?.voice_minutes_used) ?? 0);
    const baseRemaining = computed(() => Math.max(0, base.value - used.value));

    const topUps = computed<any[]>(() => (isFreemium.value ? [] : sub.value?.active_top_ups ?? []));
    const topUpRemaining = computed(() => topUps.value.reduce((s, p) => s + (p.minutes_remaining ?? 0), 0));

    const remaining = computed(() => baseRemaining.value + topUpRemaining.value);
    // Usage of the BASE budget (the bar/banner threshold); top-ups are extra.
    const usedPct = computed(() => (base.value > 0 ? Math.min(100, Math.round((used.value / base.value) * 100)) : used.value > 0 ? 100 : 0));
    const renewalDate = computed(() => (isFreemium.value ? free.value?.end_date : sub.value?.end_date));

    // "N min left" — compact remaining-minutes label for inline use (the session-card pill).
    // Deliberately omits the total: sitting next to "X/Y Sessions" (used/total), an "X/Y minutes"
    // (remaining/total) form reads ambiguously, so we show only the unambiguous "left" count.
    const { t } = useI18n();
    const leftLabel = computed(() => t('subscription.voice-meter.left-voice', { n: baseRemaining.value }));

    return { isFreemium, tier, base, used, baseRemaining, topUps, topUpRemaining, remaining, usedPct, renewalDate, leftLabel };
}
