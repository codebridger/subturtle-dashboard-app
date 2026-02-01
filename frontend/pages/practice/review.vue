<template>
    <LeitnerReviewSession :items="items" :loading="loading" :title="$t('review.title')"
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
const { reviewSessionItems } = storeToRefs(leitnerStore);

const loading = ref(true);
const items = computed(() => reviewSessionItems.value);

onMounted(async () => {
    loading.value = true;
    await leitnerStore.fetchReviewSession(20);
    loading.value = false;
});

async function handleSubmitResult(phraseId: string, isCorrect: boolean) {
    await leitnerStore.submitReview(phraseId, isCorrect);
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
