<template>
    <!-- Council 004 Surface 6: always visible to paid users; hidden on Starter. -->
    <Card v-if="!isFreemium" class="w-full rounded-lg border border-gray-100 shadow-sm dark:border-gray-700">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white-light">{{ t('subscription.top-ups.title') }}</h2>
        <p class="mt-1 text-sm text-gray-500">{{ t('subscription.top-ups.description') }}</p>

        <!-- Direct-buy buttons (the user has already chosen a size — no picker here). -->
        <div class="mt-4 flex flex-wrap gap-3">
            <Button
                v-for="pack in TOP_UP_PACKS"
                :key="pack.key"
                outline
                color="primary"
                :loading="loadingKey === pack.key"
                :label="t('subscription.top-ups.add', { minutes: pack.minutes, price: localizeGbp(pack.gbp) })"
                @click="buyPack(pack.key)"
            />
        </div>

        <div class="mt-6">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white-light">{{ t('subscription.top-ups.active-header') }}</h3>
            <ul v-if="activeTopUps.length" class="mt-2 space-y-2">
                <li v-for="(p, i) in activeTopUps" :key="i" class="text-sm text-gray-600 dark:text-gray-300">
                    {{ t('subscription.top-ups.active-line', { size: p.pack_size, left: p.minutes_remaining, date: formatDate(p.expires_at) }) }}
                </li>
            </ul>
            <p v-else class="mt-2 text-sm text-gray-400">{{ t('subscription.top-ups.empty') }}</p>
        </div>
    </Card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { Card, Button } from 'pilotui/elements';
    import { useProfileStore } from '~/stores/profile';
    import { useVoiceTopUp, TOP_UP_PACKS, localizeGbp } from '~/composables/useVoiceTopUp';

    const { t } = useI18n();
    const profileStore = useProfileStore();
    const { loadingKey, buyPack } = useVoiceTopUp();

    const isFreemium = computed(() => profileStore.isFreemium);
    const activeTopUps = computed<any[]>(() => (profileStore.activeSubscription as any)?.active_top_ups ?? []);

    function formatDate(d: string | Date) {
        try {
            return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
        } catch {
            return '';
        }
    }
</script>
