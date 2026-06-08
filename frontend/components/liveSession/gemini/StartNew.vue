<template>
    <section class="mx-auto max-w-3xl space-y-4 p-4">
        <Card class="space-y-2 shadow-none">
            <!-- Bundle Selection -->
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ t('bundle.select_bundle') }}
            </label>
            <select v-model="formData.bundleId"
                class="focus:border-primary-500 focus:ring-primary-500 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                <option value="">{{ t('bundle.select_bundle') }}</option>
                <option v-for="bundle in bundleList" :key="bundle._id" :value="bundle._id">
                    {{ bundle.title }}
                </option>
            </select>
        </Card>
        <Card class="!p-0 shadow-none" :class="{ 'cursor-not-allowed opacity-50': !formData.bundleId }">
            <StartLiveSessionForm class="m-4" v-model="formData" :voice-options="GEMINI_VOICES" ref="formRef"
                @start="handleStartLiveSession" />

            <!-- Freemium: mode-aware limit card (sessions for voice, text chats for
                 text). In voice mode the voice minutes are merged in as a sub-line. -->
            <div class="m-4" v-if="profileStore.isFreemium">
                <FreemiumLimitationModal :modal-title="t('freemium.limitation.title')"
                    :main-message="t('freemium.limitation.no_free_spots_left')"
                    :sub-message="t('freemium.limitation.upgrade_to_pro_message')"
                    :primary-button-label="t('freemium.limitation.go_pro')"
                    :secondary-button-label="t('freemium.limitation.continue_with_limits')"
                    @upgrade="handleConfirmUpgrade">
                    <template #trigger="{ toggleModal }">
                        <FreemiumLimitCard :type="formData.mode === 'text' ? 'textChat' : 'liveSession'"
                            :sub-info="formData.mode !== 'text' ? voiceLeftLabel : ''"
                            :action-label="t('live-practice.start')"
                            @action="startSession" @upgrade="toggleModal(true)" />
                    </template>
                </FreemiumLimitationModal>
            </div>

            <!-- Premium: mode-aware balance (voice minutes / Reader text chats) + start. -->
            <div class="m-4 space-y-3" v-else>
                <VoiceMeter v-if="formData.mode !== 'text'" size="sm" />
                <TextChatCounter v-else />
                <Button color="primary" block :disabled="!isFormValid || !formData.bundleId" @click="startSession"
                    :label="t('live-practice.start')" />
            </div>
        </Card>
    </section>
</template>

<script setup lang="ts">
// Standalone "start a new session" entry point bound to the Gemini practice page.
import { Button, Card } from 'pilotui/elements';
import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
import type { LiveSessionRequest } from '~/types/live-session-request';
import { pickPhraseIds, encodeSessionRequest } from '~/utils/livePractice';
import { dataProvider } from '@modular-rest/client';
import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';
import StartLiveSessionForm from '~/components/bundle/StartLiveSessionForm.vue';
import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
import FreemiumLimitCard from '~/components/freemium_alerts/FreemiumLimitCard.vue';
import VoiceMeter from '~/components/VoiceMeter.vue';
import TextChatCounter from '~/components/TextChatCounter.vue';
import { useProfileStore } from '~/stores/profile';
import { useVoiceBalance } from '~/composables/useVoiceBalance';
import { openVoiceCapModal } from '~/composables/useVoiceCapModal';

const GEMINI_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];

const router = useRouter();
const { t } = useI18n();
const profileStore = useProfileStore();
const { remaining: voiceRemaining, leftLabel: voiceLeftLabel } = useVoiceBalance();

const bundleList = ref<PhraseBundleType[]>([]);
const filter = ref('');

const controller = dataProvider.list<PhraseBundleType>(
    {
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.PHRASE_BUNDLE,
        query: {
            refId: authUser.value?.id,
            title: { $regex: filter.value, $options: 'i' },
        },
        options: { sort: { _id: -1 } },
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
        await controller.updatePagination();
        await controller.fetchPage(1);
    } catch (error) {
        console.error(error);
    }
});

const formRef = ref<InstanceType<typeof StartLiveSessionForm> | null>(null);

const formData = reactive({
    bundleId: '',
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
    return formData.selectionMode === 'selection'
        ? !formRef.value.selectionError
        : !formRef.value.randomError;
});

function startSession() {
    if (!isFormValid.value || !formData.bundleId) return;

    // Council 004: a paid user out of voice minutes gets the dedicated voice-cap
    // modal (top-up / use text chat) — voice mode only, never for a text session.
    if (!profileStore.isFreemium && formData.mode !== 'text' && voiceRemaining.value <= 0) {
        openVoiceCapModal();
        return;
    }

    const sessionData: LivePracticeSessionSetupType = {
        aiCharacter: formData.aiCharacter,
        selectionMode: formData.selectionMode,
        nativeLanguage: formData.nativeLanguage,
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
    // Build the unified request the /practice/live-session dispatcher consumes:
    // resolve the selection to concrete phrase ids from the chosen bundle and carry
    // the practice mode, then route through the gate. The old `live-session-<id>`
    // path matched no route (404) and dropped the mode field entirely. [B2]
    const bundle = bundleList.value.find((b) => b._id === formData.bundleId);
    const request: LiveSessionRequest = {
        aiCharacter: sessionData.aiCharacter,
        nativeLanguage: sessionData.nativeLanguage,
        mode: formData.mode,
        title: bundle?.title,
        source: { phraseIds: pickPhraseIds(bundle?.phrases ?? [], sessionData) },
        returnTo: '/sessions/new',
    };
    const session = encodeSessionRequest(request);
    router.push(`/practice/live-session?session=${encodeURIComponent(session)}`);
}

function handleConfirmUpgrade() {
    router.push('/settings/subscription');
}
</script>
