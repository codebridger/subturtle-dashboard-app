<template>
    <MaterialPracticeToolScaffold
        :title="$t('review.title')"
        :activePhrase="currentIndex + 1"
        :totalPhrases="totalItems"
        bundleId="leitner"
        @end-session="endSession"
    >
        <div v-if="loading" class="flex h-full w-full items-center justify-center">
            <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
        </div>

        <div v-else-if="items.length === 0" class="flex h-full w-full flex-col items-center justify-center p-8 text-center">
             <Icon name="iconify solar--confetti-bold-duotone" class="mb-4 text-6xl text-success-500" />
             <h2 class="text-2xl font-bold">{{ $t('board.all_caught_up') }}</h2>
             <Button class="mt-6" @click="endSession" variant="soft">{{ $t('board.back_to_board') }}</Button>
        </div>

        <div v-else class="flex h-full w-full flex-col items-center p-5 md:px-16 md:py-14">
            <div :class="['w-full flex-1 ', 'md:max-h-[80%] md:max-w-[80%]', 'lg:max-h-[65%] lg:max-w-[65%]']">
                <!-- Use WidgetFlashCard based on phrase type -->
                <WidgetFlashCard
                    v-if="currentPhrase && currentPhrase.type === 'normal'"
                    :key="`normal-${currentIndex}`"
                    :phrase-type="'normal'"
                    :front="currentPhrase.phrase"
                    :back="currentPhrase.translation"
                    :context="currentPhrase.context"
                    :translation-language="currentPhrase.translation_language"
                />

                <WidgetFlashCard
                    v-else-if="currentPhrase && currentPhrase.type === 'linguistic'"
                    :key="`linguistic-${currentIndex}`"
                    :phrase-type="'linguistic'"
                    :front="currentPhrase.phrase"
                    :back="currentPhrase.linguistic_data?.definition || currentPhrase.phrase"
                    :context="currentPhrase.context"
                    :direction="currentPhrase.direction"
                    :language-info="currentPhrase.language_info"
                    :linguistic-data="currentPhrase.linguistic_data"
                />

                <WidgetFlashCard
                    v-else-if="currentPhrase"
                    :key="`fallback-${currentIndex}`"
                    :front="currentPhrase.phrase"
                    :back="currentPhrase.translation || 'No translation'"
                />
            </div>

            <!-- Leitner Controls -->
            <selection class="my-6 flex max-h-[65%] w-full max-w-[65%] items-center justify-center space-x-8">
                 <Button 
                    @click="submitResult(false)" 
                    color="danger" 
                    variant="soft"
                    rounded="full"
                    size="lg"
                    class="h-16 w-16"
                 >
                    <Icon name="iconify solar--close-circle-bold" class="h-8 w-8" />
                 </Button>
                 
                 <Button 
                    @click="submitResult(true)" 
                    color="success" 
                    variant="soft"
                    rounded="full"
                    size="lg"
                    class="h-16 w-16"
                 >
                    <Icon name="iconify solar--check-circle-bold" class="h-8 w-8" />
                 </Button>
            </selection>
        </div>
    </MaterialPracticeToolScaffold>
</template>

<script setup lang="ts">
import { useLeitnerStore } from '~/stores/leitner';
import { IconButton, Button, Icon } from '@codebridger/lib-vue-components/elements.ts';
import { type PhraseType } from '~/types/database.type';
import { storeToRefs } from 'pinia';

definePageMeta({
    // @ts-ignore
    layout: 'empty',
    middleware: ['auth'],
});

const router = useRouter();
const leitnerStore = useLeitnerStore();
const { reviewSessionItems } = storeToRefs(leitnerStore);

const loading = ref(true);
const currentIndex = ref(0);

const items = computed(() => reviewSessionItems.value);
const totalItems = computed(() => items.value.length);

const currentItem = computed(() => items.value[currentIndex.value]);
const currentPhrase = computed(() => currentItem.value?.phrase as PhraseType);

onMounted(async () => {
    loading.value = true;
    const res = await leitnerStore.fetchReviewSession(20); // Default limit
    if (res.length === 0) {
        // Maybe auto-redirect? 
        // Or show the "caught up" screen
    }
    loading.value = false;
});

async function submitResult(isCorrect: boolean) {
    if (!currentPhrase.value) return;

    // Submit to store/API
    const phraseId = currentPhrase.value._id;
    await leitnerStore.submitReview(phraseId, isCorrect);

    // Move to next
    if (currentIndex.value < totalItems.value - 1) {
        currentIndex.value++;
    } else {
        // Finished session
        endSession();
    }
}

function endSession() {
    router.push('/board');
}
</script>
