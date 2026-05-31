<template>
    <!-- Council 004 Surface 4: the 100% voice-cap modal on Start Voice Chat. A
         dedicated modal (top-up offer + text-chat fallback), NOT the generic
         tier-limit modal. Closable (X / Esc / backdrop) — the secondary action keeps
         the user practising rather than trapping them. -->
    <Modal :title="t('subscription.voice-modal.title')" size="md" :modelValue="open" @close="closeVoiceCapModal">
        <div class="space-y-2 p-2 text-center">
            <p class="text-gray-700 dark:text-gray-300">{{ t('subscription.voice-modal.body1', { total: base }) }}</p>
            <p v-if="renewsOn" class="text-sm text-gray-500">{{ t('subscription.voice-meter.resets', { date: renewsOn }) }}</p>
            <p class="text-gray-700 dark:text-gray-300">{{ t('subscription.voice-modal.body2', { price: thirtyPrice }) }}</p>
        </div>
        <template #footer>
            <div class="flex w-full flex-col gap-2">
                <Button
                    color="primary"
                    block
                    :loading="loadingKey === 'topup_30'"
                    :label="t('subscription.voice-modal.add30', { price: thirtyPrice })"
                    @click="onAdd30"
                />
                <Button block outline color="primary" :label="t('subscription.voice-modal.use-text')" @click="onUseText" />
                <button type="button" class="mt-1 text-center text-xs text-primary hover:underline" @click="showPicker = true">
                    {{ t('subscription.voice-modal.see-all') }}
                </button>
            </div>
        </template>
    </Modal>

    <TopUpPickerModal v-model="showPicker" />
</template>

<script setup lang="ts">
    import { ref, computed } from 'vue';
    import { Button } from 'pilotui/elements';
    import { Modal } from 'pilotui/complex';
    import TopUpPickerModal from '~/components/TopUpPickerModal.vue';
    import { useVoiceCapModal } from '~/composables/useVoiceCapModal';
    import { useVoiceBalance } from '~/composables/useVoiceBalance';
    import { useVoiceTopUp, TOP_UP_PACKS, localizeGbp } from '~/composables/useVoiceTopUp';

    const { t } = useI18n();
    const router = useRouter();
    const { open, phraseId, closeVoiceCapModal } = useVoiceCapModal();
    const { base, renewalDate } = useVoiceBalance();
    const { loadingKey, buyPack } = useVoiceTopUp();

    const showPicker = ref(false);
    const thirtyPrice = computed(() => localizeGbp(TOP_UP_PACKS[0].gbp));
    const renewsOn = computed(() => {
        const d = renewalDate.value;
        if (!d) return '';
        try {
            return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
        } catch {
            return '';
        }
    });

    // Primary skips the picker — straight to the 30-min checkout (the user is mid-task).
    function onAdd30() {
        buyPack('topup_30');
        closeVoiceCapModal();
    }
    // Secondary keeps the user practising, carrying any saved-phrase context to text chat.
    function onUseText() {
        closeVoiceCapModal();
        router.push(phraseId.value ? `/practice/live-session-text?phraseId=${phraseId.value}` : '/practice/live-session-text');
    }
</script>
