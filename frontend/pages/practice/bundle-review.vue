<template>
	<LeitnerReviewSession :items="items" :loading="loading" :title="$t('review.bundle_review')"
		@submit-result="handleSubmitResult" @end-session="endSession" />
</template>

<script setup lang="ts">
import { useLeitnerStore } from '~/stores/leitner';
import { storeToRefs } from 'pinia';
import LeitnerReviewSession from '~/components/practice/LeitnerReviewSession.vue';

definePageMeta({
	// @ts-ignore
	layout: 'empty',
	middleware: ['auth'],
});

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

	loading.value = true;
	await leitnerStore.fetchCustomReviewSession(pendingBundleReviewIds.value);
	loading.value = false;
});

async function handleSubmitResult(phraseId: string, isCorrect: boolean) {
	await leitnerStore.submitReview(phraseId, isCorrect);
}

function endSession() {
	// Return to previous page or bundle detail?
	router.back();
}
</script>

<style scoped></style>
