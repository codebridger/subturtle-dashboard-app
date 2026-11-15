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
const title = useStudyingTitle('review.bundle_review');

const router = useRouter();
const leitnerStore = useLeitnerStore();
const { customReviewSessionItems, pendingBundleReviewIds } = storeToRefs(leitnerStore);

const loading = ref(true);
const items = computed(() => customReviewSessionItems.value);

onMounted(async () => {
	if (pendingBundleReviewIds.value.length === 0) {
		// If no items pending, redirect back (or handle empty state)
		router.push('/bundles');
		return;
	}

	analytic.track(ANALYTICS_EVENTS.FLASHCARD_REVIEW_STARTED, { deck_type: 'bundle_review' });
	loading.value = true;
	await leitnerStore.fetchCustomReviewSession(pendingBundleReviewIds.value);
	loading.value = false;
});

async function handleSubmitResult(phraseId: string, isCorrect: boolean, result?: ReviewResult) {
	await leitnerStore.submitReview(phraseId, isCorrect, result);
}

function endSession() {
	// Return to previous page or bundle detail?
	router.back();
}
</script>

<style scoped></style>
