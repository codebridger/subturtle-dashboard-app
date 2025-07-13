<template>
    <MaterialPracticeToolScaffold
        :title="bundle?.title || 'Flashcards'"
        :activePhrase="phraseIndex + 1"
        :totalPhrases="totalPhrases"
        :bundleId="id.toString()"
        :body-class="'flex flex-col items-center justify-start'"
        :isLoading="!errorMode && !liveSessionStore.isSessionActive"
        :error-mode="errorMode"
        @end-session="endLiveSession"
    >
        <template v-if="bundle">
            <!-- Freemium Timer Section -->
            <FreemiumTimer
                v-if="profileStore.isFreemium"
                :duration="timerConfig.duration"
                :label="t('freemium.timer.remaining_time')"
                @expired="showTimerExpiredModal = true"
                @warning="handleTimerWarning"
            />

            <section :class="['overflow-y-auto', 'flex w-full flex-1 flex-col items-center md:justify-center', 'sm:px-5 md:px-32 lg:px-52']">
                <!-- Instruction text -->
                <div class="mb-4 text-center text-sm text-gray-600 dark:text-gray-400">
                    <p v-if="!activePhrase">Click on any vocabulary card to start practicing</p>
                    <p v-else>
                        Currently practicing: <strong>{{ activePhrase.phrase }}</strong>
                    </p>
                </div>

                <div :class="['flex flex-wrap items-start justify-center gap-2 lg:!items-center', 'p-4']">
                    <!-- All phrases -->
                    <div v-for="(phrase, index) in selectedPhrases" :key="phrase._id" @click="selectPhrase(index)" class="cursor-pointer">
                        <Card
                            :class="[
                                // base
                                'relative rounded-lg text-center',
                                // transition
                                'transition-all duration-300 ease-in-out',
                                // size
                                'p-2 px-3 text-xs',
                                'lg:!p-5 lg:!px-10',
                                'md:!p-3 md:!px-5 md:text-xs',

                                // colors
                                '!dark:bg-transparent bg-transparent text-black dark:text-white-light',
                                // clickable styles
                                'hover:scale-105 hover:shadow-lg',
                                // active state
                                {
                                    'opacity-60': !activePhrase || activePhrase._id !== phrase._id,
                                    '!border-4 !border-dashed !border-primary !opacity-100': activePhrase && activePhrase._id === phrase._id,
                                },
                            ]"
                        >
                            <h1 :class="['text-xs font-bold', 'sm:!text-base md:!text-lg lg:!text-2xl']">{{ phrase.phrase }}</h1>
                            <p :class="['text-xs', 'sm:!text-base md:!text-lg lg:!text-2xl', 'text-gray-500 dark:text-white-light']">
                                {{ phrase.translation }}
                            </p>
                            <span class="absolute bottom-0 right-0 scale-75 rounded-xl bg-gray-100 px-2 text-xs text-gray-500"> {{ index + 1 }} </span>
                            <span
                                v-if="activePhrase && activePhrase._id === phrase._id"
                                class="absolute right-0 top-0 scale-75 rounded-xl p-2 text-xs text-white"
                            >
                                <Icon name="IconChatDot" class="text-primary" />
                            </span>
                        </Card>
                    </div>
                </div>
            </section>

            <section :class="['h-[100px] md:!h-[150px] lg:!h-[200px]', 'items-start', 'flex w-full  flex-col items-center  justify-center gap-4']">
                <BundleMicToggle />

                <div class="flex items-center justify-center gap-2 text-[8px] opacity-50">
                    <span>IN {{ liveSessionStore.tokenUsage?.input_tokens }}</span>
                    <span>CACHED {{ liveSessionStore.tokenUsage?.input_token_details.cached_tokens }}</span>
                    <span>OUT {{ liveSessionStore.tokenUsage?.output_tokens }}</span>
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
    <audio ref="ai-agent"></audio>

    <!-- Timer Expired Modal -->
    <FreemiumLimitationModal
        v-model="showTimerExpiredModal"
        :modal-title="t('freemium.timer.time_expired')"
        :main-message="t('freemium.timer.session_limit_reached')"
        :sub-message="t('freemium.timer.upgrade_for_unlimited')"
        icon-name="IconClock"
        :primary-button-label="t('freemium.limitation.go_pro')"
        :secondary-button-label="t('freemium.timer.exit_session')"
        :auto-redirect-on-upgrade="false"
        prevent-close
        hide-close
        @upgrade="handleUpgrade"
        @secondary="endLiveSession"
        @close="handleTimerModalClose"
    />
</template>

<script setup lang="ts">
    import { Card, Button, Icon } from '@codebridger/lib-vue-components/elements.ts';
    import { dataProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseType, type PopulatedPhraseBundleType } from '~/types/database.type';
    import { useLiveSessionStore } from '~/stores/liveSession';
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

    const liveSessionStore = useLiveSessionStore();
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

    // Timer modal state
    const showTimerExpiredModal = ref(false);

    // Timer configuration - can be customized per use case
    const timerConfig = {
        duration: 5 * 60, // 5 minutes for live sessions
        // duration: 10, // 10 seconds for quick demo
    };

    const audioRef = useTemplateRef<HTMLAudioElement>('ai-agent');

    const instructions = `
    You are a friendly and engaging AI language English tutor.
    Your goal is to help the user practice and reinforce understanding the vocabularies listed below.

    Instructions:
    1. Welcome the user and explain that they can click on any vocabulary card to practice that specific word.
    2. When the user selects a vocabulary (you'll be notified via "user_selected_vocabulary" function), start practicing that word with them.
    3. Lead the conversation and ask the user to use the selected vocabulary in the conversation.
    4. Encourage the user to select another vocabulary when they're ready to practice a different word.
    5. Continue this process until the user wants to finish the session.
    6. When the user wants to end the session, they can call the "finish_practice" function.

    Considerations:
    - The user will manually select which vocabulary to practice by clicking on the vocabulary cards.
    - You will be notified when the user selects a vocabulary through the "user_selected_vocabulary" function.
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

        await fetchFlashcard().then((res) => {
            selectedPhrases.value = getPhraseSelection();
        });

        await createLiveSession();
    });

    const tools = {
        // user_selected_vocabulary: {
        //     handler: (arg: { wordNumber: number }) => {
        //         const wordIndex = arg.wordNumber - 1;

        //         if (wordIndex === -1 || wordIndex == undefined || wordIndex >= selectedPhrases.value.length) {
        //             phraseIndex.value = -1;
        //             return { success: false, error: 'the vocabulary number' + arg.wordNumber + ' is not found' };
        //         }

        //         phraseIndex.value = wordIndex as number;
        //         const phrase = selectedPhrases.value[wordIndex].phrase;
        //         return { success: true, message: `The user selected vocabulary number ${arg.wordNumber}: ${phrase} for practice` };
        //     },
        //     definition: {
        //         type: 'function',
        //         name: 'user_selected_vocabulary',
        //         description: 'Notify the AI that the user has selected a vocabulary to practice.',
        //         parameters: {
        //             type: 'object',
        //             required: ['wordNumber'],
        //             properties: {
        //                 wordNumber: {
        //                     type: 'number',
        //                     description: 'The vocabulary number that the user selected to practice.',
        //                 },
        //             },
        //         },
        //     },
        // },
        finish_practice: {
            handler: () => {
                endLiveSession();
            },
            definition: {
                type: 'function',
                name: 'finish_practice',
                description: 'Finish the practice session.',
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
            .catch((err) => {
                toastError({ title: 'Failed to fetch flashcard' });
            })
            .finally(() => {
                console.log(bundle.value);
            });
    }

    function createLiveSession() {
        const phrases = (selectedPhrases.value.map((p, i) => i + 1 + '. ' + p.phrase) || []).join('\n');

        liveSessionStore
            .createLiveSession({
                sessionDetails: {
                    instructions: instructions.replace('[phrases]', phrases),
                    voice: sessionDataParsed.aiCharacter || 'alloy',
                },
                metadata: sessionDataParsed,
                tools: tools,
                audioRef: audioRef.value,
                onUpdate: handleSessionEvent,
            })
            .then((_res) => {
                analytic.track('live-session_started');
                // fetch subscription to update the freemium allocation
                return useProfileStore().fetchSubscription();
            })
            .catch((error) => {
                analytic.track('live-session_failed');

                errorMode.value = true;
                errorMessage.value = error?.error || error?.message || 'Failed to start live session';
            });
    }

    function endLiveSession() {
        liveSessionStore.endLiveSession();
        router.push(`/bundles/${id}`);
    }

    function handleSessionEvent(eventData: any) {
        // Any additional event handling specific to this component
        // For example, you might want to handle certain events that aren't
        // already handled in the store
        const { type, event_id } = eventData;
        // console.log('Event:', eventData);

        if (type === 'session.created') {
            console.log('Session created', eventData);
            triggerTheConversation();
        }

        if (eventData.response !== undefined && eventData.response.usage) {
            console.log('event - Response with usage', eventData.response);
        }

        if (eventData.item !== undefined && eventData.item.usage) {
            console.log('event - Item with usage', eventData.item);
        }

        // Ai Transcript Delta
        if (type == 'response.audio_transcript.delta') {
            // console.log('event - audio delta', eventData.delta);
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

    function handleTimerWarning(timeRemaining: number) {
        // Optional: Handle timer warning events
        // Could be used for warnings at specific time intervals
        console.log(`Timer warning: ${timeRemaining} seconds remaining`);
    }

    function handleTimerModalClose() {
        showTimerExpiredModal.value = false;
    }

    function handleUpgrade() {
        router.push('/settings/subscription');
    }

    function selectPhrase(index: number) {
        console.log('selectPhrase called with index:', index);
        console.log('Current phraseIndex:', phraseIndex.value);
        console.log('Selected phrases:', selectedPhrases.value);
        console.log('Live session active:', liveSessionStore.isSessionActive);

        phraseIndex.value = index;
        console.log('Updated phraseIndex to:', phraseIndex.value);

        // Inform the AI that the user selected a vocabulary
        if (liveSessionStore.isSessionActive) {
            const wordNumber = index + 1;
            const phrase = selectedPhrases.value[index].phrase;
            console.log('Triggering conversation for word number:', wordNumber, 'phrase:', phrase);

            try {
                // Only send a text message for context
                const message = `The user selected a different vocabulary: "${phrase}". Let's start practicing on it.`;
                liveSessionStore.sendMessage(message);
                console.log('Successfully sent message to AI');
            } catch (error) {
                console.error('Failed to inform AI about vocabulary selection:', error);
            }
        } else {
            console.log('Live session is not active, skipping AI notification');
        }
    }
</script>
