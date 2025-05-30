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
            <section :class="['overflow-y-auto', 'flex w-full flex-1 flex-col items-center md:justify-center', 'sm:px-5 md:px-32 lg:px-52']">
                <div :class="['flex flex-wrap items-start justify-center gap-2 lg:!items-center', 'py-4']">
                    <!-- All phrases -->
                    <Card
                        v-for="(phrase, index) in selectedPhrases"
                        :key="phrase._id"
                        :class="[
                            // base
                            'relative rounded-lg text-center opacity-40',
                            // transition
                            'transition-all duration-300 ease-in-out',
                            // size
                            'p-2 px-3 text-xs',
                            'lg:!p-5 lg:!px-10',
                            'md:!p-3 md:!px-5 md:text-xs',

                            // colors
                            '!dark:bg-transparent bg-transparent text-black dark:text-white-light',
                            {
                                '!opacity-100': !activePhrase,
                            },
                            {
                                '!border-4 border-dashed !border-primary !opacity-100': activePhrase && activePhrase._id === phrase._id,
                            },
                        ]"
                    >
                        <h1 :class="['text-xs font-bold', 'sm:!text-base md:!text-lg lg:!text-2xl']">{{ phrase.phrase }}</h1>
                        <p :class="['text-xs', 'sm:!text-base md:!text-lg lg:!text-2xl', 'text-gray-500 dark:text-white-light']">
                            {{ phrase.translation }}
                        </p>
                        <span class="absolute bottom-0 right-0 scale-75 rounded-xl bg-gray-100 px-2 text-xs text-gray-500"> {{ index + 1 }} </span>
                    </Card>
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
</template>

<script setup lang="ts">
    import { Card, Button } from '@codebridger/lib-vue-components/elements.ts';
    import { dataProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseType, type PopulatedPhraseBundleType } from '~/types/database.type';
    import { useLiveSessionStore } from '~/stores/liveSession';
    import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
    import { useProfileStore } from '~/stores/profile';

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

    const audioRef = useTemplateRef<HTMLAudioElement>('ai-agent');

    const instructions = `
    You are a friendly and engaging AI language English tutor.
    Your goal is to help the user practice and reinforce understanding the vocabularies listed below.

    Instructions:
    1. Start with first vocabulary from the list and call "set_active_vocabulary" function from your tools to set the active vocabulary.
    2. When you get the activation confirmation, start the vocabulary practice with the user.
    3. You have to lead the conversation and ask the user to use the vocabulary in the conversation.
    4. then pick the next vocabulary from the list and call "set_active_vocabulary" function from your tools to set the active vocabulary.
    5. repeat the practice until you get you finish the last vocabulary.
    6. tell the user goodbye after the last vocabulary and ask him to finish the practice session by calling "finish_practice" function from your tools.

    Considerations:
    - user might speak in other languages, but the main conversation should be Practicing English, you might need to switch between the user language and English, but should ask user to speak english.
    - if user don't suggest a specific way of practice, you have to start from first vocabulary and try to practice with user, the user is your student you need to lead the conversation.
    - it's better to explain things in the user language not english and then ask the user t speak english and perform your practice.
    - it's not necessary to re tell what users says in practice time.
    - don't sensor anything from the user list, remember it's a english practice and a language has bad and good phrases, but all should be given a lecture.
    - Finish the practice session with a good bye message after the last vocabulary, consider the vocabulary numbers.
    - you get 'no more vocabulary' if there is no more vocabulary to practice.
    - don't ask user what he wants, you have to select the vocabulary and start the practice.
    - practice only the vocabularies listed below.
    - don't forget to call "set_active_vocabulary" function to set the active vocabulary to practice.
    - don't forget to call "finish_practice" function to finish the practice session.
    - make sure say goodbye to user when you want to finish the practice session.
    - max follow up practice for each vocabulary is 2 times.

    Practice Instructions:
    - Please create dynamic and engaging dialogues where you naturally incorporate these vocabularies. Ask me follow-up questions, encourage me to use the vocabularies in my own responses, and correct my mistakes when necessary. Keep the conversation lively and interactive, adjusting to my responses to make it feel like a real conversation!

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
        set_active_vocabulary: {
            handler: (arg: { wordNumber: number }) => {
                const wordIndex = arg.wordNumber - 1;

                if (wordIndex === -1 || wordIndex == undefined || wordIndex >= selectedPhrases.value.length) {
                    phraseIndex.value = -1;
                    return { success: false, error: 'the vocabulary number' + arg.wordNumber + ' is not found' };
                }

                phraseIndex.value = wordIndex as number;
                const phrase = selectedPhrases.value[wordIndex].phrase;
                return { success: true, message: `The vocabulary number ${arg.wordNumber}.${phrase} is set as active vocabulary` };
            },
            definition: {
                type: 'function',
                name: 'set_active_vocabulary',
                description: 'Set the active vocabulary to practice.',
                parameters: {
                    type: 'object',
                    required: ['wordNumber'],
                    properties: {
                        wordNumber: {
                            type: 'number',
                            description: 'The vocabulary number to set as active vocabulary.',
                        },
                    },
                },
            },
        },
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
                // fetch subscription to update the freemium allocation
                return useProfileStore().fetchSubscription();
            })
            .catch((error) => {
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
        const message = `The user is here, greeting to the user, and start the practice session with the first word from the given list`;
        const microphoneNotice = `Then Encurage the user to unmute the microphone, microphone is ${liveSessionStore.getMicrophoneMuted ? 'muted' : 'unmuted'}`;
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
</script>
