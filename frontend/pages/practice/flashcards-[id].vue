<template>
    <MaterialPracticeToolScaffold :title="bundle?.title || 'Flashcards'" :activePhrase="phraseIndex + 1"
        :totalPhrases="totalPhrases" :bundleId="id.toString()" @end-session="endFlashcardSession">
        <div :class="['flex h-full w-full flex-col items-center p-5', 'md:px-16 md:py-14']">
            <div :class="['w-full flex-1 ', 'md:max-h-[80%] md:max-w-[80%]', 'lg:max-h-[65%] lg:max-w-[65%]']">
                <WidgetFlashCard v-if="phrase" :key="phraseIndex" :phrase="phrase" :leitner-level="cardLevel" />
            </div>

            <selection class="my-6 flex max-h-[65%] w-full max-w-[65%] items-center justify-between">
                <div v-if="!isLeitnerMode">
                    <IconButton icon="IconPlayCircle" rounded="md" color="muted" size="lg" disabled />
                </div>

                <!-- Leitner Controls -->
                <div v-if="isLeitnerMode" class="flex w-full justify-center space-x-8">
                    <Button @click="submitLeitnerResult(false)" color="danger" variant="soft" rounded="full" size="lg">
                        <Icon name="IconX" class="h-8 w-8" />
                    </Button>

                    <Button @click="submitLeitnerResult(true)" color="success" variant="soft" rounded="full" size="lg">
                        <Icon name="IconCheck" class="h-8 w-8" />
                    </Button>
                </div>

                <div v-else class="flex space-x-2">
                    <IconButton icon="IconArrowLeft" rounded="md" color="muted" size="lg" @click="prevCard"
                        :disabled="phraseIndex === 0" />

                    <IconButton icon="IconArrowRight" rounded="md" color="muted" size="lg" @click="nextCard"
                        :disabled="!isNextAvailable" />
                </div>

                <div v-if="!isLeitnerMode">
                    <IconButton icon="iconify solar--shuffle-line-duotone" rounded="md" color="muted" size="lg"
                        disabled />
                </div>
            </selection>
        </div>

        <Modal :modelValue="showComplete" size="sm" persistent :hideClose="true" @close="showComplete = false">
            <div class="flex flex-col items-center p-4 text-center">
                <Icon name="iconify solar--confetti-bold-duotone" class="mb-4 text-6xl text-success-500" />
                <h2 class="text-2xl font-bold">{{ t('leitner_session.completed_title') }}</h2>
            </div>

            <template #footer>
                <div class="flex justify-end">
                    <Button color="primary" @click="endFlashcardSession">{{ t('board.back_to_board') }}</Button>
                </div>
            </template>
        </Modal>
    </MaterialPracticeToolScaffold>
</template>

<script setup lang="ts">
import { dataProvider, functionProvider } from '@modular-rest/client';
import { IconButton, Button, Icon } from 'pilotui/elements';
import { Modal } from 'pilotui/complex';
import { toastError } from 'pilotui/toast';
import { COLLECTIONS, DATABASE, type PopulatedPhraseBundleType } from '~/types/database.type';
import { useProfileStore } from '~/stores/profile';
import { storeToRefs } from 'pinia';
import { analytic } from '~/plugins/mixpanel';
import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';

definePageMeta({
    // @ts-ignore
    layout: 'empty',
    // @ts-ignore
    middleware: ['auth'],
});

const { t } = useI18n();

const route = useRoute();
const { id } = route.params;

// Auth Store
const profileStore = useProfileStore();
const { authUser } = storeToRefs(profileStore);

const bundle = ref<PopulatedPhraseBundleType | null>(null);
const phraseIndex = ref(0);
const showComplete = ref(false);

const isLeitnerMode = computed(() => {
    return route.query.type === 'leitner' || id === 'leitner';
});

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

// Leitner level drives the L3+ cloze; carried on the enriched phrase in Leitner mode
// (undefined otherwise → recognition card). FlashCard derives everything else from the phrase.
const cardLevel = computed<number | undefined>(() => (phrase.value as any)?._leitnerLevel);

onMounted(async () => {
    await fetchFlashcard();
    // Only count a review that actually loaded cards (matches the other review
    // pages); a failed or empty load is not a started review.
    if (totalPhrases.value > 0) {
        analytic.track(ANALYTICS_EVENTS.FLASHCARD_REVIEW_STARTED, {
            deck_type: isLeitnerMode.value ? 'leitner' : 'flashcards',
        });
    }
});

function endFlashcardSession() {
    const router = useRouter();
    if (isLeitnerMode.value) {
        router.push('/practice/review');
    } else {
        router.push(`/bundles/${id}`);
    }
}

function fetchFlashcard() {
    if (isLeitnerMode.value) {
        return functionProvider.run({
            name: 'get-review-session',
            args: { limit: 20, userId: authUser.value?.id }
        }).then((items: any) => {
            if (!Array.isArray(items) || items.length === 0) {
                bundle.value = { title: 'Daily Review', phrases: [], refId: authUser.value?.id } as any;
                return;
            }
            // get-review-session returns raw Leitner items: the phrase is populated on each item and the
            // box level sits under `_doc` (same shape LeitnerReviewSession reads). Carry the level through
            // on the enriched phrase so the L3+ cloze can render.
            const phrases = items.map((i: any) => ({
                ...i.phrase,
                _leitnerLevel: i.boxLevel ?? i._doc?.boxLevel,
            }));
            bundle.value = {
                title: 'Daily Review',
                phrases,
                refId: authUser.value?.id,
            } as any;
        }).catch(err => {
            console.error(err);
        });
    }

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
            // toastError({ title: 'Failed to fetch flashcard' });
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

async function submitLeitnerResult(correct: boolean) {
    if (!bundle.value || !phrase.value) return;

    const currentPhraseId = (phrase.value as any)._id; // phrase._id might be strict

    // fire and forget? No, we should ensure it is saved? 
    // Better to await to handle error.
    try {
        await functionProvider.run({
            name: 'submit-review',
            args: {
                userId: authUser.value?.id,
                phraseId: currentPhraseId,
                isCorrect: correct
            }
        });

        // Move to next
        if (phraseIndex.value < bundle.value.phrases.length - 1) {
            phraseIndex.value++;
        } else {
            // End session — celebratory modal; redirect happens on its button click.
            showComplete.value = true;
        }
    } catch (e) {
        console.error("Failed to submit", e);
        toastError(t('leitner_session.save_failed'));
    }
}
</script>
