<template>
    <div v-if="state !== 'hidden'" class="flex items-center gap-3 px-4 py-2.5 text-sm" :class="state === 'paused'
        ? 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
        : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'">
        <span class="flex-1">
            {{ state === 'paused' ? t('subscription.cap-banner.paused') : t('subscription.cap-banner.running-low') }}
        </span>
        <Button size="sm" color="primary" :label="t('subscription.cap-banner.upgrade-cta')" @click="goToPlans" />
        <button type="button" class="flex-shrink-0 px-1 text-lg leading-none opacity-60 hover:opacity-100"
            :aria-label="t('subscription.cap-banner.dismiss')" @click="dismissed = true">
            ×
        </button>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Button } from 'pilotui/elements';
import { useProfileStore } from '~/stores/profile';

// Usage % at which the "running low" warning appears. Hard cap (AI paused) is
// always 100%. Mirrors SOFT_CAP_PERCENT in the subscription module config.
const SOFT_CAP_PERCENT = 80;

const profileStore = useProfileStore();
const router = useRouter();
const { t } = useI18n();

// Dismissal is per session — we don't nag once the user has acknowledged it.
const dismissed = ref(false);

const state = computed<'hidden' | 'warning' | 'paused'>(() => {
    if (dismissed.value) return 'hidden';
    if (profileStore.isAiPaused) return 'paused';
    if (profileStore.usagePercentage >= SOFT_CAP_PERCENT) return 'warning';
    return 'hidden';
});

function goToPlans() {
    router.push('/settings/subscription');
}
</script>
