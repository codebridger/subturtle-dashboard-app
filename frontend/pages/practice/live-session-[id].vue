<template>
    <MaterialPracticeToolScaffold :title="bundle?.title || 'Flashcards'" :activePhrase="practicedCount"
        :totalPhrases="totalPhrases" :bundleId="id.toString()"
        :body-class="'flex flex-col items-stretch min-h-0 overflow-hidden'"
        :isLoading="!errorMode && !liveSessionStore.isSessionActive" :error-mode="errorMode"
        @end-session="endLiveSession">
        <template v-if="bundle">
            <!-- Freemium Timer Section -->
            <FreemiumTimer v-if="profileStore.isFreemium" class="shrink-0" :duration="timerConfig.duration"
                :label="t('freemium.timer.remaining_time')" @expired="showTimerExpiredModal = true"
                @warning="handleTimerWarning" />

            <!-- Compact phrase cards row -->
            <section class="relative w-full shrink-0 px-3 pt-3 md:px-6">
                <button type="button" @click="hideTranslations = !hideTranslations"
                    class="absolute right-3 top-3 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] text-gray-500 transition-colors hover:bg-gray-100 dark:text-white-light/60 dark:hover:bg-white/5 md:right-6"
                    :title="hideTranslations ? 'Show translations' : 'Hide translations (self-test mode)'">
                    <Icon
                        :name="hideTranslations ? 'iconify solar--eye-closed-bold-duotone' : 'iconify solar--eye-bold-duotone'"
                        class="text-base" />
                    <span class="hidden sm:inline">{{ hideTranslations ? 'Show' : 'Hide' }} translations</span>
                </button>
                <div class="flex flex-wrap items-stretch justify-center gap-2">
                    <div v-for="(phrase, index) in selectedPhrases" :key="phrase._id" @click="selectPhrase(index)"
                        class="w-[160px] cursor-pointer md:w-[200px]"
                        :title="hideTranslations ? '' : phrase.translation">
                        <Card :class="[
                            'relative rounded-lg text-center',
                            'transition-all duration-300 ease-in-out',
                            'p-2 px-3 text-xs md:!p-3 md:!px-4',
                            '!dark:bg-transparent bg-transparent text-black dark:text-white-light',
                            'hover:scale-105 hover:shadow-lg',
                            {
                                'opacity-50 hover:opacity-90': !activePhrase || activePhrase._id !== phrase._id,
                                '!border-2 !border-primary !opacity-100 ring-2 ring-primary/30 shadow-lg shadow-primary/20': activePhrase && activePhrase._id === phrase._id,
                                'animate-card-pulse': activePhrase && activePhrase._id === phrase._id && isAiSpeaking,
                            },
                        ]">
                            <div class="flex items-baseline justify-center gap-2">
                                <span class="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">{{ index + 1 }}</span>
                                <h2 class="truncate text-sm font-bold sm:!text-base md:!text-lg">{{ phrase.phrase }}</h2>
                            </div>
                            <p class="truncate text-[11px] text-gray-500 dark:text-white-light/60 sm:!text-sm md:!text-base"
                                :class="{ 'tracking-widest': hideTranslations }">
                                {{ hideTranslations ? '••••••' : phrase.translation }}
                            </p>
                            <span v-if="practicedPhraseIds.has(phrase._id) && (!activePhrase || activePhrase._id !== phrase._id)"
                                class="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-success text-white">
                                <Icon name="IconCheck" class="text-[10px]" />
                            </span>
                            <span v-if="activePhrase && activePhrase._id === phrase._id"
                                class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shadow">
                                <Icon name="IconChatDot" class="text-[10px]" />
                            </span>
                        </Card>
                    </div>
                </div>
            </section>

            <!-- Live transcript -->
            <section ref="transcriptScroll"
                class="flex w-full min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 md:px-16 lg:px-32">
                <div v-if="visibleDialogs.length === 0"
                    class="flex flex-1 flex-col items-center justify-center text-center">
                    <Icon name="IconChatDot" class="mb-3 text-3xl text-primary/40" />
                    <p v-if="!activePhrase" class="text-sm text-gray-600 dark:text-white-light/70">
                        Click on any vocabulary card to start practicing
                    </p>
                    <p v-else class="text-sm text-gray-700 dark:text-white-light">
                        Currently practicing: <strong>{{ activePhrase.phrase }}</strong>
                    </p>
                    <p class="mt-1 text-xs text-gray-500 dark:text-white-light/50">
                        Your conversation will appear here.
                    </p>
                </div>

                <TransitionGroup v-else name="dialog" tag="div" class="flex w-full flex-col gap-3">
                    <div v-for="dialog in visibleDialogs" :key="dialog.id" :class="[
                        'max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm',
                        dialog.speaker === 'ai'
                            ? 'self-start bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-white-light'
                            : 'self-end bg-primary/10 text-primary-dark dark:bg-primary/20 dark:text-white-light'
                    ]">
                        <p class="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                            {{ dialog.speaker === 'ai' ? 'Coach' : 'You' }}
                        </p>
                        <p class="whitespace-pre-wrap">{{ dialog.content }}</p>
                    </div>
                </TransitionGroup>
            </section>

            <!-- Mic + status -->
            <section
                class="flex w-full shrink-0 flex-col items-center justify-center gap-2 px-4 pb-4 pt-2 md:gap-3 md:pb-6">
                <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-white-light/70">
                    <span :class="[
                        'inline-block h-2 w-2 rounded-full',
                        statusDotColor,
                        isPulsing ? 'animate-pulse' : ''
                    ]" />
                    <span>{{ statusLabel }}</span>
                    <div v-if="!liveSessionStore.isMicrophoneMuted && !isAiSpeaking"
                        class="ml-1 flex h-3 items-end gap-[2px]" aria-label="Microphone input level">
                        <span v-for="(threshold, i) in micLevelThresholds" :key="i" :class="[
                            'block w-[3px] rounded-sm transition-colors duration-75',
                            liveSessionStore.micLevel >= threshold
                                ? 'bg-success'
                                : 'bg-gray-300 dark:bg-white-light/20'
                        ]" :style="{ height: `${(i + 1) * 20}%` }" />
                    </div>
                </div>

                <BundleMicToggleGemini />

                <div v-if="isDev"
                    class="flex items-center justify-center gap-2 text-[8px] opacity-50">
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

    <!-- End-of-session recap -->
    <Modal title="Practice complete" size="md" :modelValue="showRecapModal" @close="dismissRecap">
        <template #default>
            <div class="space-y-4 p-2">
                <p class="text-center text-sm text-gray-600 dark:text-white-light/70">
                    You practiced
                    <strong class="text-primary">{{ practicedCount }}</strong>
                    of {{ totalPhrases }} phrase{{ totalPhrases === 1 ? '' : 's' }} this session.
                </p>
                <ul class="flex flex-col gap-2">
                    <li v-for="phrase in selectedPhrases" :key="phrase._id" :class="[
                        'flex items-center gap-3 rounded-lg p-2 text-sm',
                        practicedPhraseIds.has(phrase._id)
                            ? 'bg-success/10 text-gray-800 dark:text-white-light'
                            : 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-white-light/60'
                    ]">
                        <Icon :name="practicedPhraseIds.has(phrase._id)
                            ? 'IconCheck'
                            : 'iconify solar--close-circle-bold-duotone'" :class="[
                                'shrink-0 text-lg',
                                practicedPhraseIds.has(phrase._id) ? 'text-success' : 'text-gray-400'
                            ]" />
                        <div class="min-w-0 flex-1">
                            <p class="truncate font-bold">{{ phrase.phrase }}</p>
                            <p class="truncate text-xs opacity-70">{{ phrase.translation }}</p>
                        </div>
                    </li>
                </ul>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-end">
                <Button color="primary" label="Back to bundle" @click="dismissRecap" />
            </div>
        </template>
    </Modal>

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
import { Modal } from 'pilotui/complex';
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
const practicedPhraseIds = ref<Set<string>>(new Set());
const activePhrase = computed(() => {
    if (!bundle.value) return null;
    return selectedPhrases.value[phraseIndex.value];
});
const totalPhrases = computed<number>(() => {
    return selectedPhrases.value.length || 0;
});
const practicedCount = computed<number>(() => practicedPhraseIds.value.size);

const showTimerExpiredModal = ref(false);
const showRecapModal = ref(false);
const hideTranslations = ref(false);

const timerConfig = {
    duration: 5 * 60,
};

const isDev = import.meta.env.DEV;

// RMS thresholds for the 5-segment input-level meter. Speech typically peaks
// around 0.1–0.3 RMS; values below 0.02 are treated as silence.
const micLevelThresholds = [0.02, 0.05, 0.1, 0.18, 0.3];

// Touch devices have no spacebar, so the status hint adapts.
const isCoarsePointer = ref(false);
onMounted(() => {
    isCoarsePointer.value = window.matchMedia?.('(pointer: coarse)').matches ?? false;
});

// ---- Live transcript + status state ----
const transcriptScroll = ref<HTMLElement | null>(null);

const visibleDialogs = computed(() =>
    liveSessionStore.conversationDialogs.filter((d) => d.content?.trim().length)
);

// AI is "speaking" while transcript chunks for the latest AI turn keep arriving;
// we expire the flag a short moment after the last chunk so the indicator settles.
const isAiSpeaking = ref(false);
let aiSilenceTimer: ReturnType<typeof setTimeout> | null = null;

watch(
    () => visibleDialogs.value.map((d) => `${d.id}:${d.content.length}`).join('|'),
    () => {
        const last = visibleDialogs.value[visibleDialogs.value.length - 1];
        if (last?.speaker === 'ai') {
            isAiSpeaking.value = true;
            if (aiSilenceTimer) clearTimeout(aiSilenceTimer);
            aiSilenceTimer = setTimeout(() => {
                isAiSpeaking.value = false;
            }, 1500);
        }
        nextTick(() => {
            const el = transcriptScroll.value;
            if (el) el.scrollTop = el.scrollHeight;
        });
    }
);

// The blank layout expects body-level scroll, but this page owns the full
// viewport and scrolls only the transcript section internally. Lock the body
// while mounted so a stray pixel doesn't introduce a second scrollbar.
onMounted(() => {
    document.body.classList.add('overflow-hidden');
    document.documentElement.classList.add('overflow-hidden');
});

onUnmounted(() => {
    if (aiSilenceTimer) clearTimeout(aiSilenceTimer);
    document.body.classList.remove('overflow-hidden');
    document.documentElement.classList.remove('overflow-hidden');
});

const statusLabel = computed(() => {
    const state = liveSessionStore.connState;
    if (state === 'resuming') return 'Reconnecting…';
    if (state === 'goingAway') return 'Renewing connection…';
    if (state === 'connecting' || state === 'setup-pending') return 'Connecting…';
    if (state === 'closed' || state === 'idle') return 'Disconnected';
    if (isAiSpeaking.value) return 'Coach is speaking…';
    if (liveSessionStore.isMicrophoneMuted) {
        return isCoarsePointer.value
            ? 'Tap the mic to speak'
            : 'Tap the mic or press space to speak';
    }
    return 'Listening — go ahead';
});

const statusDotColor = computed(() => {
    const state = liveSessionStore.connState;
    if (state === 'resuming' || state === 'goingAway') return 'bg-yellow-400';
    if (state === 'closed' || state === 'idle') return 'bg-gray-400';
    if (state === 'connecting' || state === 'setup-pending') return 'bg-gray-400';
    if (isAiSpeaking.value) return 'bg-primary';
    if (liveSessionStore.isMicrophoneMuted) return 'bg-gray-400';
    return 'bg-success';
});

const isPulsing = computed(() => {
    if (isAiSpeaking.value) return true;
    return ['resuming', 'goingAway', 'connecting', 'setup-pending'].includes(
        liveSessionStore.connState
    );
});

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
    // Tear down the live connection immediately so we don't keep streaming
    // (and billing) audio while the recap is on screen. Navigation is
    // deferred until the user dismisses the recap.
    liveSessionStore.endLiveSession();

    // Skip the recap when the freemium timer is forcing the exit (the timer
    // modal is already up) or when the user bails before practicing anything.
    if (practicedCount.value > 0 && !showTimerExpiredModal.value) {
        showRecapModal.value = true;
        return;
    }
    router.push(`/bundles/${id}`);
}

function dismissRecap() {
    showRecapModal.value = false;
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
    const phrase = selectedPhrases.value[index];
    practicedPhraseIds.value.add(phrase._id);
    liveSessionStore.sendMessage(
        `The user selected a different vocabulary: "${phrase.phrase}". Let's start practicing on it.`
    );
}
</script>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
    transition: opacity 0.25s ease, transform 0.25s ease;
}

.dialog-enter-from {
    opacity: 0;
    transform: translateY(8px);
}

.dialog-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

@keyframes card-pulse {

    0%,
    100% {
        box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.35);
    }

    50% {
        box-shadow: 0 0 0 8px rgba(99, 102, 241, 0);
    }
}

.animate-card-pulse {
    animation: card-pulse 1.4s ease-in-out infinite;
}
</style>
