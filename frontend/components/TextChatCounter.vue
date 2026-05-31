<template>
    <!-- Council 004 Surface 2 rider: Reader-only text-chat counter, inside the active
         plan card's "This month" section. No top-up button (no top-up for text chat);
         the only path past the cap is upgrade. Hidden on Starter / Learner / Coach. -->
    <div v-if="visible" class="mt-3">
        <div class="flex items-center justify-between text-sm">
            <span class="text-gray-600 dark:text-gray-300">{{ t('subscription.text-chat-counter.label', { used, total: cap }) }}</span>
            <button v-if="atLimit" type="button" class="text-xs font-medium text-primary hover:underline" @click="findOutMore">
                {{ t('subscription.text-chat-counter.find-out-more') }}
            </button>
        </div>
        <div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div class="h-full rounded-full transition-all duration-500" :class="fillColor" :style="{ width: `${usedPct}%` }"></div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { useProfileStore } from '~/stores/profile';

    const { t } = useI18n();
    const router = useRouter();
    const profileStore = useProfileStore();

    const sub = computed(() => profileStore.activeSubscription as any);
    const isReader = computed(() => !profileStore.isFreemium && sub.value?.tier === 'reader');
    const cap = computed<number | null>(() => sub.value?.allowed_text_chats ?? null);
    const used = computed<number>(() => sub.value?.allowed_text_chats_used ?? 0);

    // Reader only, and only when a finite monthly cap is in effect.
    const visible = computed(() => isReader.value && cap.value != null);
    const usedPct = computed(() => (cap.value ? Math.min(100, Math.round((used.value / cap.value) * 100)) : 0));
    const atLimit = computed(() => cap.value != null && used.value >= cap.value);

    const fillColor = computed(() => {
        if (usedPct.value >= 100) return 'bg-red-500';
        if (usedPct.value >= 80) return 'bg-amber-500';
        return 'bg-teal-500';
    });

    // At the cap, point the user at Learner's unlimited text chat.
    function findOutMore() {
        router.push('/settings/subscription?suggest=learner');
    }
</script>
