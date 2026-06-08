<template>
    <!-- Council 004 Surface 3: 80% voice banner. Same style as UsageCapBanner; its
         own dismiss state. Mounted ABOVE the AI-credits banner (voice is more time-
         sensitive). The 100% case hands off to the VoiceCapModal, not this banner. -->
    <div
        v-if="show"
        role="status"
        class="flex flex-wrap items-center gap-3 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
    >
        <span class="flex-1">{{ message }}</span>
        <Button size="sm" color="primary" :label="t('subscription.voice-banner.top-up')" @click="showPicker = true" />
        <Button v-if="!isCoach" size="sm" :label="t('subscription.voice-banner.upgrade')" @click="goUpgrade" />
        <button
            type="button"
            class="flex-shrink-0 px-1 text-lg leading-none opacity-60 hover:opacity-100"
            :aria-label="t('subscription.voice-banner.dismiss')"
            @click="dismissed = true"
        >
            ×
        </button>

        <TopUpPickerModal v-model="showPicker" />
    </div>
</template>

<script setup lang="ts">
    import { ref, computed } from 'vue';
    import { Button } from 'pilotui/elements';
    import TopUpPickerModal from '~/components/TopUpPickerModal.vue';
    import { useVoiceBalance } from '~/composables/useVoiceBalance';

    const { t } = useI18n();
    const router = useRouter();
    const { isFreemium, tier, base, baseRemaining, topUpRemaining, usedPct } = useVoiceBalance();

    // Dismissed once per session per meter (separate from the AI-credits banner).
    const dismissed = ref(false);
    const showPicker = ref(false);

    const isCoach = computed(() => tier.value === 'coach');
    const isReader = computed(() => tier.value === 'reader');

    const show = computed(() => {
        if (isFreemium.value || dismissed.value) return false;
        // Reader (no base budget) nudges when a top-up runs low; others at 80% of base.
        if (isReader.value) return topUpRemaining.value > 0 && topUpRemaining.value <= 6;
        return usedPct.value >= 80 && usedPct.value < 100;
    });

    const message = computed(() =>
        isReader.value
            ? t('subscription.voice-banner.reader', { n: topUpRemaining.value })
            : t('subscription.voice-banner.message', { n: baseRemaining.value, total: base.value })
    );

    // Learner's "Upgrade plan" highlights Coach; Coach has no tier above (button hidden).
    function goUpgrade() {
        router.push('/settings/subscription?from=voice-banner&suggest=coach');
    }
</script>
