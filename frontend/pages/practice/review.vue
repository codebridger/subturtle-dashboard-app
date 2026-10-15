<template>
    <LeitnerReviewSession :items="items" :loading="loading" :title="title"
        @submit-result="handleSubmitResult" @end-session="endSession" />
</template>

<script setup lang="ts">
import { useStudyingTitle } from '~/composables/useStudyingTitle';
import type { ReviewResult } from '~/types/language.type';
import { useLeitnerStore } from '~/stores/leitner';
import { storeToRefs } from 'pinia';
import LeitnerReviewSession from '~/components/practice/LeitnerReviewSession.vue';
import { analytic } from '~/plugins/mixpanel';
import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';

definePageMeta({
    // The app shell, so the language menu is on every screen (D-04).
    layout: 'default',
    middleware: ['auth'],
});

// "Review · German": which language is being studied (D-13).
const title = useStudyingTitle('review.title');

const router = useRouter();
const leitnerStore = useLeitnerStore();
const { reviewSessionItems } = storeToRefs(leitnerStore);

const loading = ref(true);
const items = computed(() => reviewSessionItems.value);

onMounted(async () => {
    loading.value = true;
    await leitnerStore.fetchReviewSession(20);
    loading.value = false;
    // Only count a review that actually has cards (matches bundle-review.vue);
    // an empty "all caught up" visit is not a started review.
    if (items.value.length) {
        analytic.track(ANALYTICS_EVENTS.FLASHCARD_REVIEW_STARTED, { deck_type: 'smart_review' });
    }
});

async function handleSubmitResult(phraseId: string, isCorrect: boolean, result?: ReviewResult) {
    await leitnerStore.submitReview(phraseId, isCorrect, result);
}

function endSession() {
    router.push('/board');
}
</script>

<style scoped>
/* Scoped styles moved to component or can be removed if specific page styling needed */
</style>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
    transition: all 0.3s ease;
}

.fade-slide-enter-from {
    opacity: 0;
    transform: translateX(30px);
}

.fade-slide-leave-to {
    opacity: 0;
    transform: translateX(-30px);
}
</style>
