<template>
    <!-- Council 004 Surface 5: pack picker, both sizes side-by-side, no default. -->
    <Modal :title="t('subscription.top-ups.picker-title')" size="md" :modelValue="modelValue" @close="$emit('update:modelValue', false)">
        <div class="p-2">
            <p class="mb-4 text-sm text-gray-500">{{ t('subscription.top-ups.picker-sub') }}</p>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div
                    v-for="pack in TOP_UP_PACKS"
                    :key="pack.key"
                    class="relative flex flex-col items-center rounded-lg border border-[#e0e6ed] p-5 text-center dark:border-[#1b2e4b]"
                >
                    <span v-if="pack.bestValue" class="absolute -top-3 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                        {{ t('subscription.top-ups.best-value') }}
                    </span>
                    <div class="text-2xl font-bold text-gray-900 dark:text-white-light">{{ pack.minutes }} {{ t('subscription.top-ups.minutes') }}</div>
                    <div class="mt-1 text-lg text-gray-700 dark:text-white-dark">{{ localizeGbp(pack.gbp) }}</div>
                    <Button
                        class="mt-4"
                        block
                        color="primary"
                        :loading="loadingKey === pack.key"
                        :label="t('subscription.top-ups.choose', { minutes: pack.minutes })"
                        @click="onChoose(pack.key)"
                    />
                </div>
            </div>
            <p class="mt-4 text-center text-xs text-gray-400">{{ t('subscription.top-ups.footer') }}</p>
        </div>
    </Modal>
</template>

<script setup lang="ts">
    import { Button } from 'pilotui/elements';
    import { Modal } from 'pilotui/complex';
    import { useVoiceTopUp, TOP_UP_PACKS, localizeGbp } from '~/composables/useVoiceTopUp';

    defineProps<{ modelValue: boolean }>();
    const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

    const { t } = useI18n();
    const { loadingKey, buyPack } = useVoiceTopUp();

    function onChoose(key: 'topup_30' | 'topup_120') {
        buyPack(key);
        emit('update:modelValue', false);
    }
</script>
