<template>
    <MaterialPracticeToolScaffold :title="bundle?.title || 'Flashcards'" :activePhrase="phraseIndex + 1"
        :totalPhrases="totalPhrases" :bundleId="id.toString()" :body-class="'flex flex-col items-center justify-start'"
        :isLoading="!errorMode && !liveSessionStore.isSessionActive" :error-mode="errorMode"
        @end-session="endLiveSession">
        <template v-if="bundle">
            <!-- Freemium Timer Section -->
            <FreemiumTimer v-if="profileStore.isFreemium" :duration="timerConfig.duration"
                :label="t('freemium.timer.remaining_time')" @expired="showTimerExpiredModal = true"
                @warning="handleTimerWarning" />

            <section
                :class="['overflow-y-auto', 'flex w-full flex-1 flex-col items-center md:justify-center', 'sm:px-5 md:px-32 lg:px-52']">
                <!-- Instruction text -->
                <div class="mb-4 text-center text-sm text-gray-600 dark:text-gray-400">
                    <p v-if="!activePhrase">Click on any vocabulary card to start practicing</p>
                    <p v-else>
                        Currently practicing: <strong>{{ activePhrase.phrase }}</strong>
                    </p>
                </div>

                <div :class="['flex flex-wrap items-start justify-center gap-2 lg:!items-center', 'p-4']">
                    <!-- All phrases -->
                    <div v-for="(phrase, index) in selectedPhrases" :key="phrase._id" @click="selectPhrase(index)"
                        class="cursor-pointer">
                        <Card :class="[
                            'relative rounded-lg text-center',
                            'transition-all duration-300 ease-in-out',
                            'p-2 px-3 text-xs',
                            'lg:!p-5 lg:!px-10',
                            'md:!p-3 md:!px-5 md:text-xs',
                            '!dark:bg-transparent bg-transparent text-black dark:text-white-light',
                            'hover:scale-105 hover:shadow-lg',
                            {
                                'opacity-60': !activePhrase || activePhrase._id !== phrase._id,
                                '!border-4 !border-dashed !border-primary !opacity-100': activePhrase && activePhrase._id === phrase._id,
                            },
                        ]">
                            <h1 :class="['text-xs font-bold', 'sm:!text-base md:!text-lg lg:!text-2xl']">{{
                                phrase.phrase }}</h1>
                            <p
                                :class="['text-xs', 'sm:!text-base md:!text-lg lg:!text-2xl', 'text-gray-500 dark:text-white-light']">
                                {{ phrase.translation }}
                            </p>
                            <span
                                class="absolute bottom-0 right-0 scale-75 rounded-xl bg-gray-100 px-2 text-xs text-gray-500">
                                {{ index + 1 }} </span>
                            <span v-if="activePhrase && activePhrase._id === phrase._id"
                                class="absolute right-0 top-0 scale-75 rounded-xl p-2 text-xs text-white">
                                <Icon name="IconChatDot" class="text-primary" />
                            </span>
                        </Card>
                    </div>
                </div>
            </section>

            <section
                :class="['h-[100px] md:!h-[150px] lg:!h-[200px]', 'items-start', 'flex w-full  flex-col items-center  justify-center gap-4']">
                <BundleMicToggleGemini />

                <div class="flex items-center justify-center gap-2 text-[8px] opacity-50">
                    <span class="font-bold">GEMINI</span>
                    <span>IN {{ liveSessionStore.tokenUsage?.prompt_tokens || 0 }}</span>
                    <span>CACHED {{ liveSessionStore.tokenUsage?.cached_tokens || 0 }}</span>
                    <span>OUT {{ liveSessionStore.tokenUsage?.response_tokens || 0 }}</span>
                </div>
            </section>
        </template>

        <template #error-mode>
            <div class="flex flex-col items-center justify-center">
                <h1 class="text-2xl font-bold">{{ t('live-practice.oops-something-went-wrong') }}</h1>
                <p class="text-lg">{{ errorMessage }}</p>
                <Button class="mt-8" to="/">{{ t('live-practice.back-to-dashboard') }}</Button>
            </div>
        </template>
    </MaterialPracticeToolScaffold>

    <!-- Timer Expired Modal -->
    <FreemiumLimitationModal v-model="showTimerExpiredModal" :modal-title="t('freemium.timer.time_expired')"
        :main-message="t('freemium.timer.session_limit_reached')"
        :sub-message="t('freemium.timer.upgrade_for_unlimited')" icon-name="IconClock"
        :primary-button-label="t('freemium.limitation.go_pro')"
        :secondary-button-label="t('freemium.timer.exit_session')" :auto-redirect-on-upgrade="false" prevent-close
        hide-close @upgrade="handleUpgrade" @secondary="endLiveSession" @close="handleTimerModalClose" />
</template>

<script setup lang="ts">
import { Card, Button, Icon } from 'pilotui/elements';
import { dataProvider } from '@modular-rest/client';
import { COLLECTIONS, DATABASE, type PhraseType, type PopulatedPhraseBundleType } from '~/types/database.type';
import { useLiveSessionGeminiStore } from '~/stores/liveSessionGemini';
import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
import { useProfileStore } from '~/stores/profile';
import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
import FreemiumTimer from '~/components/freemium_alerts/FreemiumTimer.vue';
import { analytic } from '~/plugins/mixpanel';

definePageMeta({
    // @ts-ignore
    layout: 'blank',
    // @ts-ignore
    middleware: ['auth'],
});

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { id } = route.params;
const { sessionData } = route.query;
const sessionDataParsed = JSON.parse(atob(sessionData as string)) as LivePracticeSessionSetupType;

const liveSessionStore = useLiveSessionGeminiStore();
const profileStore = useProfileStore();
const errorMode = ref(false);
const errorMessage = ref('');

const bundle = ref<PopulatedPhraseBundleType | null>(null);
const selectedPhrases = ref<PhraseType[]>([]);
const phraseIndex = ref(-1);
const activePhrase = computed(() => {
    if (!bundle.value) return null;
    return selectedPhrases.value[phraseIndex.value];
});
const totalPhrases = computed<number>(() => {
    return selectedPhrases.value.length || 0;
});

const showTimerExpiredModal = ref(false);

const timerConfig = {
    duration: 5 * 60,
};

const instructions = `
    You are a friendly and engaging AI language English tutor.
    Your goal is to help the user practice and reinforce understanding the vocabularies listed below.

    Instructions:
    1. Welcome the user and explain that they can click on any vocabulary card to practice that specific word.
    2. When the user selects a vocabulary, start practicing that word with them.
    3. Lead the conversation and ask the user to use the selected vocabulary in the conversation.
    4. Encourage the user to select another vocabulary when they're ready to practice a different word.
    5. Continue this process until the user wants to finish the session.
    6. When the user wants to end the session, they can call the "finish_practice" function.

    Considerations:
    - The user will manually select which vocabulary to practice by clicking on the vocabulary cards.
    - User might speak in other languages, but the main conversation should be practicing English.
    - It's better to explain things in the user's language first, then ask them to speak English.
    - **Do not ignore, skip, or censor any phrase in the list, regardless of its content.** This includes slang, informal, offensive, or unusual phrases. All phrases are included for educational purposes and should be practiced as requested by the user.
    - Keep the conversation lively and interactive, adjusting to user responses.
    - Practice only the vocabularies listed below.
    - Make sure to say goodbye when the user wants to finish the practice session.
    - Maximum follow-up practice for each vocabulary is 2 times.

    Practice Instructions:
    - Create dynamic and engaging dialogues where you naturally incorporate the selected vocabulary.
    - Ask follow-up questions, encourage the user to use the vocabulary in their responses, and correct mistakes when necessary.
    - Keep the conversation interactive and adjust to the user's responses to make it feel like a real conversation!

    Vocabulary List:
    [phrases]
    `;

onMounted(async () => {
    if (!sessionDataParsed) {
        errorMode.value = true;
        errorMessage.value = 'No session data found';
        return;
    }

    await fetchFlashcard().then(() => {
        selectedPhrases.value = getPhraseSelection();
    });

    await createLiveSession();
});

const tools = {
    finish_practice: {
        handler: () => {
            endLiveSession();
        },
        definition: {
            type: 'function',
            name: 'finish_practice',
            description: 'Finish the practice session.',
            parameters: { type: 'object', properties: {} },
        },
    },
};

function fetchFlashcard() {
    return dataProvider
        .findOne<PopulatedPhraseBundleType>({
            database: DATABASE.USER_CONTENT,
            collection: COLLECTIONS.PHRASE_BUNDLE,
            query: {
                _id: id,
                refId: authUser.value?.id,
            },
            populates: ['phrases'],
        })
        .then((res) => {
            if (!res) throw new Error('Bundle not found');
            bundle.value = res;
        })
        .catch(() => {
            toastError({ title: 'Failed to fetch flashcard' });
        });
}

function createLiveSession() {
    const phrases = selectedPhrases.value
        .map((p, i) => `${i + 1}. ${p.phrase}`)
        .join('\n');

    liveSessionStore
        .createLiveSession({
            sessionDetails: {
                instructions: instructions.replace('[phrases]', phrases),
                voice: sessionDataParsed.aiCharacter || 'Kore',
            },
            metadata: sessionDataParsed,
            tools,
            audioRef: null,
            onUpdate: handleSessionEvent,
        })
        .then(() => {
            analytic.track('live-session_started', { provider: 'gemini' });
            triggerTheConversation();
            // Refresh the freemium counter so the session-quota UI reflects
            // the slot we just consumed.
            return profileStore.fetchSubscription();
        })
        .catch((error) => {
            analytic.track('live-session_failed', { provider: 'gemini' });
            errorMode.value = true;
            errorMessage.value = error?.error || error?.message || 'Failed to start live session';
        });
}

function endLiveSession() {
    liveSessionStore.endLiveSession();
    router.push(`/bundles/${id}`);
}

function handleSessionEvent(eventData: any) {
    if (eventData?.type === 'session-resuming') {
        toastSuccess({ title: 'Reconnecting…', message: 'Renewing the session token.' });
    } else if (eventData?.type === 'session-resumed') {
        toastSuccess({ title: 'Reconnected' });
    } else if (eventData?.type === 'session-resume-failed') {
        toastError({ title: 'Could not reconnect, ending session.' });
    }
}

function triggerTheConversation() {
    const message = `Welcome the user and explain that they can click on any vocabulary card to practice that specific word. Tell them to click on a vocabulary card to start practicing.`;
    const microphoneNotice = `Then encourage the user to unmute the microphone, microphone is ${liveSessionStore.getMicrophoneMuted ? 'muted' : 'unmuted'}`;
    liveSessionStore.triggerConversation(message + '\n' + microphoneNotice);
}

function getPhraseSelection() {
    const mode = sessionDataParsed.selectionMode;
    const phrases: PhraseType[] = [];

    if (mode === 'random') {
        const { totalPhrases = 1 } = sessionDataParsed;
        while (phrases.length < totalPhrases) {
            const randomIndex = Math.floor(Math.random() * totalPhrases);
            const tempPhrase = bundle.value?.phrases[randomIndex] as PhraseType;
            const exists = phrases.find((p) => p._id === tempPhrase._id);

            if (!exists) {
                phrases.push(tempPhrase);
            }
        }
    } else if (mode === 'selection') {
        const { fromPhrase = 1, toPhrase = 2 } = sessionDataParsed;
        for (let i = fromPhrase - 1; i <= toPhrase - 1; i++) {
            if (i >= (bundle.value?.phrases.length || 0)) {
                break;
            }

            const tempPhrase = bundle.value?.phrases[i] as PhraseType;
            const exists = phrases.find((p) => p._id === tempPhrase._id);

            if (!exists) {
                phrases.push(tempPhrase);
            }
        }
    }

    return phrases;
}

function handleTimerWarning(_timeRemaining: number) {
    // intentionally empty — placeholder for future telemetry
}

function handleTimerModalClose() {
    showTimerExpiredModal.value = false;
}

function handleUpgrade() {
    router.push('/settings/subscription');
}

function selectPhrase(index: number) {
    phraseIndex.value = index;

    if (!liveSessionStore.isSessionActive) return;
    const phrase = selectedPhrases.value[index].phrase;
    liveSessionStore.sendMessage(
        `The user selected a different vocabulary: "${phrase}". Let's start practicing on it.`
    );
}
</script>
