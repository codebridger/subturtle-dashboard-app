<template>
    <!-- Reader hides the meter until the user has any voice history (a top-up or
         usage) — an always-visible "0 minutes" bar reads as nagging on a text tier. -->
    <div v-if="visible" :aria-label="ariaLabel" role="group">
        <!-- sm: a single honest line (the start-voice-chat entry point). -->
        <template v-if="size === 'sm'">
            <p class="text-sm text-gray-600 dark:text-gray-300">{{ sublineMinutes }}</p>
        </template>

        <!-- md / lg: headline, used-fill bar, sub-line, and the quiet top-up button. -->
        <template v-else>
            <div class="flex items-center justify-between gap-3">
                <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('subscription.voice-meter.headline') }}</span>
                <button
                    v-if="showTopUp"
                    type="button"
                    :class="[
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        topUpPrimary ? 'bg-primary text-white hover:bg-primary/90' : 'text-primary hover:bg-primary/10',
                    ]"
                    @click="$emit('topup')"
                >
                    {{ t('subscription.voice-meter.top-up') }}
                </button>
            </div>

            <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700" :class="{ 'h-2.5': size === 'lg' }">
                <div class="h-full rounded-full transition-all duration-500" :class="fillColor" :style="{ width: `${usedPct}%` }"></div>
            </div>

            <p class="mt-1.5 text-sm text-gray-600 dark:text-gray-300">{{ subline }}</p>
            <p v-if="showRenewalDate && renewalLabel" class="mt-0.5 text-xs text-gray-400">{{ renewalLabel }}</p>
        </template>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { useVoiceBalance } from '~/composables/useVoiceBalance';

    /**
     * Voice-minute balance meter (Council 004, UX spec Surface 1). One component, three
     * sizes, one data source (the profile store). The bar fills with the USED portion of
     * the BASE monthly grant; top-up packs are surfaced as a separate "plus N" line, not
     * folded into the bar (the base budget is the thing that renews).
     */
    withDefaults(
        defineProps<{
            size?: 'sm' | 'md' | 'lg';
            showRenewalDate?: boolean;
        }>(),
        { size: 'md', showRenewalDate: false }
    );
    defineEmits<{ topup: [] }>();

    const { t } = useI18n();

    // Council 004: the balance derivation (base / used / top-ups / usedPct) lives in
    // ONE place — the useVoiceBalance composable. The meter is pure presentation on top
    // of it; the bar reflects the base budget only (top-ups shown as a "plus N" line).
    const { isFreemium, tier, base, used, baseRemaining, topUps, topUpRemaining, usedPct, renewalDate } = useVoiceBalance();
    const isReader = computed(() => tier.value === 'reader');

    const fillColor = computed(() => {
        if (usedPct.value >= 100) return 'bg-red-500';
        if (usedPct.value >= 80) return 'bg-amber-500';
        return 'bg-teal-500';
    });

    const plusTopUp = computed(() => (topUpRemaining.value > 0 ? t('subscription.voice-meter.plus-topup', { n: topUpRemaining.value }) : ''));

    // Sub-line copy switches shape near the cap (UX spec Surface 1 copy table).
    const subline = computed(() => {
        let s: string;
        if (usedPct.value >= 100) s = t('subscription.voice-meter.none');
        else if (usedPct.value >= 80) s = t('subscription.voice-meter.low', { n: baseRemaining.value });
        else s = t('subscription.voice-meter.left', { n: baseRemaining.value, total: base.value });
        return s + plusTopUp.value;
    });
    // sm variant spells out "voice minutes" since it stands alone with no headline.
    const sublineMinutes = computed(() => t('subscription.voice-meter.left-voice', { n: baseRemaining.value, total: base.value }) + plusTopUp.value);

    const renewalLabel = computed(() => {
        const d = renewalDate.value;
        if (!d) return '';
        try {
            return t('subscription.voice-meter.resets', { date: new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) });
        } catch {
            return '';
        }
    });

    const ariaLabel = computed(() => `${t('subscription.voice-meter.headline')}: ${subline.value}${renewalLabel.value ? `. ${renewalLabel.value}` : ''}`);

    // Reader: hide until they show interest (a top-up or any usage). Others: always.
    const hasVoiceHistory = computed(() => used.value > 0 || topUps.value.length > 0);
    const visible = computed(() => !isReader.value || hasVoiceHistory.value);

    // "Top up minutes": hidden on Starter; hidden on Reader at zero with no packs (they
    // get the 100% modal instead); primary-filled at the cap to be the strongest CTA.
    const showTopUp = computed(() => {
        if (isFreemium.value) return false;
        if (isReader.value && baseRemaining.value + topUpRemaining.value <= 0 && topUps.value.length === 0) return false;
        return true;
    });
    const topUpPrimary = computed(() => usedPct.value >= 100);
</script>
