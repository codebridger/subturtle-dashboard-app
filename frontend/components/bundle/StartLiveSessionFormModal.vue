<template>
    <Modal :modelValue="modelValue" :title="t('live-practice.going-live')" @update:modelValue="$emit('update:modelValue', $event)">
        <template #trigger>
            <Button iconName="IconNotesEdit" :label="t('live-practice.label')" @click="$emit('update:modelValue', true)" />
        </template>

        <StartLiveSessionForm v-model="formData" ref="formRef" />

        <template #footer>
            <div class="-m-5">
                <!-- Freemium: Show freemium limit card -->
                <div v-if="profileStore.isFreemium">
                    <FreemiumLimitationModal @upgrade="handleConfirmUpgrade">
                        <template #trigger="{ toggleModal: toggleLimitationModal }">
                            <FreemiumLimitCard
                                type="liveSession"
                                :action-label="t('live-practice.start')"
                                @action="startSession"
                                @upgrade="toggleLimitationModal(true)"
                            />
                        </template>
                    </FreemiumLimitationModal>
                </div>

                <!-- Premium: Regular start button -->
                <div v-else>
                    <Button color="primary" :disabled="!isFormValid" @click="startSession" :label="t('live-practice.start')" />
                </div>
            </div>
        </template>
    </Modal>
</template>

<script setup lang="ts">
    import { Modal } from '@codebridger/lib-vue-components/complex.ts';
    import { Button } from '@codebridger/lib-vue-components/elements.ts';
    import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
    import StartLiveSessionForm from './StartLiveSessionForm.vue';
    import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
    import FreemiumLimitCard from '~/components/freemium_alerts/FreemiumLimitCard.vue';
    import { useProfileStore } from '~/stores/profile';

    const { t } = useI18n();
    const router = useRouter();
    const profileStore = useProfileStore();

    const props = defineProps<{
        modelValue: boolean;
    }>();

    const emit = defineEmits<{
        'update:modelValue': [value: boolean];
        start: [data: LivePracticeSessionSetupType];
    }>();

    const formRef = ref<InstanceType<typeof StartLiveSessionForm> | null>(null);

    const formData = reactive({
        aiCharacter: 'alloy',
        selectionMode: 'selection' as 'selection' | 'random',
        fromPhrase: '1',
        toPhrase: '10',
        totalPhrases: '10',
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
