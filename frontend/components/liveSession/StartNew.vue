<template>
    <section class="mx-auto max-w-3xl space-y-4 p-4">
        <Card class="space-y-2 shadow-none">
            <!-- Bundle Selection -->
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ t('bundle.select_bundle') }}
            </label>
            <select
                v-model="formData.bundleId"
                class="focus:border-primary-500 focus:ring-primary-500 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
                <option value="">{{ t('bundle.select_bundle') }}</option>
                <option v-for="bundle in bundleList" :key="bundle._id" :value="bundle._id">
                    {{ bundle.title }}
                </option>
            </select>
        </Card>
        <Card class="space-y-4 !p-0 shadow-none" :class="{ 'cursor-not-allowed opacity-50': !formData.bundleId }">
            <StartLiveSessionForm class="m-4" v-model="formData" ref="formRef" @start="handleStartLiveSession" />

            <!-- Freemium: Show freemium limit card -->
            <div v-if="profileStore.isFreemium">
                <FreemiumLimitationModal
                    :modal-title="t('freemium.limitation.title')"
                    :main-message="t('freemium.limitation.no_free_spots_left')"
                    :sub-message="t('freemium.limitation.upgrade_to_pro_message')"
                    :primary-button-label="t('freemium.limitation.go_pro')"
                    :secondary-button-label="t('freemium.limitation.continue_with_limits')"
                    @upgrade="handleConfirmUpgrade"
                >
                    <template #trigger="{ toggleModal }">
                        <FreemiumLimitCard type="liveSession" :action-label="t('live-practice.start')" @action="startSession" @upgrade="toggleModal(true)" />
                    </template>
                </FreemiumLimitationModal>
            </div>

            <!-- Premium: Regular start button -->
            <div class="m-4" v-else>
                <Button color="primary" block :disabled="!isFormValid || !formData.bundleId" @click="startSession" :label="t('live-practice.start')" />
            </div>
        </Card>
    </section>
</template>

<script setup lang="ts">
    import { Button, Card } from '@codebridger/lib-vue-components/elements.ts';
    import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
    import { dataProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';
    import StartLiveSessionForm from '~/components/bundle/StartLiveSessionForm.vue';
    import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
    import FreemiumLimitCard from '~/components/freemium_alerts/FreemiumLimitCard.vue';
    import { useProfileStore } from '~/stores/profile';

    const router = useRouter();
    const { t } = useI18n();
    const profileStore = useProfileStore();

    const bundleList = ref<PhraseBundleType[]>([]);
    const filter = ref('');

    const controller = dataProvider.list<PhraseBundleType>(
        {
            database: DATABASE.USER_CONTENT,
            collection: COLLECTIONS.PHRASE_BUNDLE,
            query: {
                refId: authUser.value?.id,
                title: {
                    $regex: filter.value,
                    $options: 'i',
                },
            },
            options: {
                sort: {
                    _id: -1,
                },
            },
        },
        {
            limit: 50,
            page: 1,
            onFetched: (data) => {
                bundleList.value = data;
            },
        }
    );

    onMounted(async () => {
        try {
            // update pagination
            await controller.updatePagination();
            // fetch first page
            await controller.fetchPage(1);
        } catch (error) {
            console.error(error);
        }
    });

    const formRef = ref<InstanceType<typeof StartLiveSessionForm> | null>(null);

    const formData = reactive({
        bundleId: '',
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
        if (!isFormValid.value || !formData.bundleId) return;

        const sessionData: LivePracticeSessionSetupType = {
            aiCharacter: formData.aiCharacter,
            selectionMode: formData.selectionMode,
        };

        if (formData.selectionMode === 'selection') {
            sessionData.fromPhrase = parseInt(formData.fromPhrase);
            sessionData.toPhrase = parseInt(formData.toPhrase);
        } else {
            sessionData.totalPhrases = parseInt(formData.totalPhrases);
        }

        handleStartLiveSession(sessionData);
    }

    function handleStartLiveSession(sessionData: LivePracticeSessionSetupType) {
        // convert sessionData to base64
        const sessionDataBase64 = btoa(JSON.stringify(sessionData));

        // URL should not include # at the beginning
        const url = `/practice/live-session-${formData.bundleId}?sessionData=${sessionDataBase64}`;
        router.push(url);
    }

    function handleConfirmUpgrade() {
        // Redirect to subscription page
        router.push('/settings/subscription');
    }
</script>
