<template>
    <!-- Council 004 Surface 2 (Starter state): free users get a usage card mirroring
         the paid active-plan card, showing their freemium caps this window. -->
    <Card v-if="isFreemium" class="w-full rounded-lg border border-gray-100 shadow-sm dark:border-gray-700">
        <div class="flex flex-col gap-4">
            <div>
                <h2 class="text-xl font-bold text-gray-900 dark:text-white-light">{{ t('subscription.starter-usage.title') }}</h2>
                <p class="mt-1 text-sm text-gray-600">{{ t('subscription.pricing.starter-price') }}</p>
            </div>

            <div class="border-t border-gray-100 pt-4 dark:border-gray-700">
                <h3 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white-light">{{ t('subscription.this-month.header') }}</h3>
                <div class="space-y-3">
                    <div v-for="row in rows" :key="row.label">
                        <div class="flex items-center justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-300">{{ row.label }}</span>
                            <span class="text-gray-500">{{ row.used }} / {{ row.total }}</span>
                        </div>
                        <div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div class="h-full rounded-full transition-all duration-500" :class="row.color" :style="{ width: `${row.pct}%` }"></div>
                        </div>
                    </div>
                </div>
                <p v-if="renewsOn" class="mt-3 text-xs text-gray-400">{{ t('subscription.voice-meter.resets', { date: renewsOn }) }}</p>
            </div>
        </div>
    </Card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { Card } from 'pilotui/elements';
    import { useProfileStore } from '~/stores/profile';

    // Free-tier caps (mirror server/src/config.ts) — fallbacks only if a legacy
    // free_credit doc predates a field; fresh allocations carry all four.
    const FALLBACK = { saveWords: 200, textChats: 5, liveSessions: 3, voice: 5 };

    const { t } = useI18n();
    const profileStore = useProfileStore();

    const isFreemium = computed(() => profileStore.isFreemium);
    const free = computed(() => profileStore.freemiumAllocation as any);

    // A used/total meter row with the shared teal -> amber (80%) -> red (100%) colours.
    function meter(used: number | undefined, total: number) {
        const u = used ?? 0;
        const pct = total > 0 ? Math.min(100, Math.round((u / total) * 100)) : 0;
        const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-500';
        return { used: u, total, pct, color };
    }

    const rows = computed(() => {
        const f = free.value || {};
        return [
            { label: t('subscription.starter-usage.saved-phrases'), ...meter(f.allowed_save_words_used, f.allowed_save_words ?? FALLBACK.saveWords) },
            { label: t('subscription.starter-usage.text-chats'), ...meter(f.allowed_text_chats_used, f.allowed_text_chats ?? FALLBACK.textChats) },
            {
                label: t('subscription.starter-usage.live-sessions'),
                ...meter(f.allowed_lived_sessions_used, f.allowed_lived_sessions ?? FALLBACK.liveSessions),
            },
            { label: t('subscription.starter-usage.voice'), ...meter(f.voice_minutes_used, f.voice_minutes_total ?? FALLBACK.voice) },
        ];
    });

    const renewsOn = computed(() => {
        const d = free.value?.end_date;
        if (!d) return '';
        try {
            return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
        } catch {
            return '';
        }
    });
</script>
