<template>
    <MaterialPracticeToolScaffold
        :title="bundle?.title || 'Flashcards'"
        :activePhrase="phraseIndex + 1"
        :totalPhrases="totalPhrases"
        :bundleId="id.toString()"
        @end-session="endFlashcardSession"
    >
        <div :class="['flex h-full w-full flex-col items-center p-5', 'md:px-16 md:py-14']">
            <div :class="['w-full flex-1 ', 'md:max-h-[80%] md:max-w-[80%]', 'lg:max-h-[65%] lg:max-w-[65%]']">
                <!-- ========== NORMAL TYPE FLASHCARD ========== -->
                <WidgetFlashCard
                    v-if="phrase && isNormalType"
                    :key="`normal-${phraseIndex}`"
                    :phrase-type="'normal'"
                    :front="phrase.phrase"
                    :back="phrase.translation"
                    :context="phrase.context"
                    :translation-language="phrase.translation_language"
                />

                <!-- ========== LINGUISTIC TYPE FLASHCARD ========== -->
                <WidgetFlashCard
                    v-else-if="phrase && isLinguisticType"
                    :key="`linguistic-${phraseIndex}`"
                    :phrase-type="'linguistic'"
                    :front="phrase.phrase"
                    :back="phrase.linguistic_data?.definition || phrase.phrase"
                    :context="phrase.context"
                    :direction="phrase.direction"
                    :language-info="phrase.language_info"
                    :linguistic-data="phrase.linguistic_data"
                />

                <!-- ========== FALLBACK FOR UNKNOWN TYPE ========== -->
                <WidgetFlashCard
                    v-else-if="phrase"
                    :key="`fallback-${phraseIndex}`"
                    :front="phrase.phrase"
                    :back="phrase.translation || 'No translation available'"
                />
            </div>

            <selection class="my-6 flex max-h-[65%] w-full max-w-[65%] items-center justify-between">
                <div>
                    <IconButton icon="IconPlayCircle" rounded="md" color="muted" size="lg" disabled />
                </div>

                <div class="flex space-x-2">
                    <IconButton icon="IconArrowLeft" rounded="md" color="muted" size="lg" @click="prevCard" :disabled="phraseIndex === 0" />

                    <IconButton icon="IconArrowRight" rounded="md" color="muted" size="lg" @click="nextCard" :disabled="!isNextAvailable" />
                </div>

                <div>
                    <IconButton icon="iconify solar--shuffle-line-duotone" rounded="md" color="muted" size="lg" disabled />
                </div>
            </selection>
        </div>
    </MaterialPracticeToolScaffold>
</template>

<script setup lang="ts">
    import { dataProvider } from '@modular-rest/client';
    import { IconButton } from '@codebridger/lib-vue-components/elements.ts';
    import { COLLECTIONS, DATABASE, type PopulatedPhraseBundleType } from '~/types/database.type';

    definePageMeta({
        // @ts-ignore
        layout: 'empty',
        // @ts-ignore
        middleware: ['auth'],
    });

    const { id } = useRoute().params;

    const bundle = ref<PopulatedPhraseBundleType | null>(null);
    const phraseIndex = ref(0);

    const phrase = computed(() => {
        if (!bundle.value) return null;
        return bundle.value.phrases[phraseIndex.value];
    });

    const totalPhrases = computed<number>(() => {
        return bundle.value?.phrases.length || 0;
    });

    const isNextAvailable = computed(() => {
        return phraseIndex.value < totalPhrases.value - 1;
    });

    // ========== PHRASE TYPE DETECTION LOGIC ==========
    /**
     * Determines if the current phrase is of "normal" type
     * Normal type phrases have: phrase, translation, translation_language
     */
    const isNormalType = computed(() => {
        return phrase.value?.type === 'normal';
    });

    /**
     * Determines if the current phrase is of "linguistic" type
     * Linguistic type phrases have: phrase, context, direction, language_info, linguistic_data
     */
    const isLinguisticType = computed(() => {
        return phrase.value?.type === 'linguistic';
    });

    onMounted(() => {
        fetchFlashcard();
    });

    function endFlashcardSession() {
        const router = useRouter();
        router.push(`/bundles/${id}`);
    }

    function fetchFlashcard() {
        dataProvider
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
                console.log('Bundle loaded:', bundle.value);
                console.log('Current phrase type:', phrase.value?.type);
            });
    }

    function nextCard() {
        if (!bundle.value) return;

        if (phraseIndex.value < bundle.value.phrases.length - 1) {
            phraseIndex.value++;
        }
    }

    function prevCard() {
        if (phraseIndex.value > 0) {
            phraseIndex.value--;
        }
    }
</script>
