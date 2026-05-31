<template>
    <Modal :modelValue="modelValue" :title="t('live-practice.going-live')"
        @update:modelValue="$emit('update:modelValue', $event)">
        <template #trigger>
            <Button iconName="IconNotesEdit" :label="t('live-practice.label')"
                @click="$emit('update:modelValue', true)" />
        </template>

        <StartLiveSessionForm v-model="formData" ref="formRef" />

        <template #footer>
            <!-- Freemium: voice-minutes line (voice mode) above the mode-aware limit
                 card — sessions for voice, text chats for text — plus the upgrade flow.
                 The -m-5 cancels the footer p-5 so the gradient card reaches the edges. -->
            <div v-if="profileStore.isFreemium">
                <div v-if="formData.mode !== 'text'" class="mb-3 px-1">
                    <VoiceMeter size="sm" />
                </div>
                <div class="-m-5">
                    <FreemiumLimitationModal :modal-title="t('freemium.limitation.title')"
                        :main-message="t('freemium.limitation.no_free_spots_left')"
                        :sub-message="t('freemium.limitation.upgrade_to_pro_message')"
                        :primary-button-label="t('freemium.limitation.go_pro')"
                        :secondary-button-label="t('freemium.limitation.continue_with_limits')"
                        @upgrade="handleConfirmUpgrade">
                        <template #trigger="{ toggleModal: toggleLimitationModal }">
                            <FreemiumLimitCard :type="formData.mode === 'text' ? 'textChat' : 'liveSession'"
                                :action-label="t('live-practice.start')"
                                @action="startSession" @upgrade="toggleLimitationModal(true)" />
                        </template>
                    </FreemiumLimitationModal>
                </div>
            </div>

            <!-- Premium: mode-aware balance (voice minutes / Reader text chats) + Start. -->
            <div v-else class="space-y-3">
                <VoiceMeter v-if="formData.mode !== 'text'" size="sm" />
                <TextChatCounter v-else />
                <Button color="primary" block :disabled="!isFormValid" @click="startSession"
                    :label="t('live-practice.start')" />
            </div>
        </template>
    </Modal>
</template>

<script setup lang="ts">
import { Modal } from 'pilotui/complex';
import { Button } from 'pilotui/elements';
import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
import StartLiveSessionForm from './StartLiveSessionForm.vue';
import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
import FreemiumLimitCard from '~/components/freemium_alerts/FreemiumLimitCard.vue';
import VoiceMeter from '~/components/VoiceMeter.vue';
import TextChatCounter from '~/components/TextChatCounter.vue';
import { useProfileStore } from '~/stores/profile';

const { t } = useI18n();
const router = useRouter();
const profileStore = useProfileStore();

const props = defineProps<{
    modelValue: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    start: [data: LivePracticeSessionSetupType & { mode?: 'voice' | 'text' }];
}>();

const formRef = ref<InstanceType<typeof StartLiveSessionForm> | null>(null);

const formData = reactive({
    aiCharacter: 'Kore',
    selectionMode: 'selection' as 'selection' | 'random',
    fromPhrase: '1',
    toPhrase: '10',
    totalPhrases: '10',
    nativeLanguage: 'auto',
    mode: 'voice' as 'voice' | 'text',
});

const isFormValid = computed(() => {
    if (!formRef.value) return false;

    if (formData.selectionMode === 'selection') {
        return !formRef.value.selectionError;
    } else {
        return !formRef.value.randomError;
    }
});

function startSession() {
    if (!isFormValid.value) return;

    const sessionData = {
        aiCharacter: formData.aiCharacter,
        selectionMode: formData.selectionMode,
        nativeLanguage: formData.nativeLanguage,
        mode: formData.mode,
    };

    if (formData.selectionMode === 'selection') {
        emit('start', {
            ...sessionData,
            fromPhrase: parseInt(formData.fromPhrase),
            toPhrase: parseInt(formData.toPhrase),
        });
    } else {
        emit('start', {
            ...sessionData,
            totalPhrases: parseInt(formData.totalPhrases),
        });
    }

    emit('update:modelValue', false);
}

function handleConfirmUpgrade() {
    // Redirect to subscription page
    router.push('/settings/subscription');
}
</script>
