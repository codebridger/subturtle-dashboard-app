<template>
	<PoolReviewSession :items="items" :loading="loading" :title="$t('pool.title')" @complete="handleComplete"
		@end-session="endSession" />
</template>

<script setup lang="ts">
import { usePoolStore } from '~/stores/pool';
import { storeToRefs } from 'pinia';
import PoolReviewSession from '~/components/practice/PoolReviewSession.vue';

definePageMeta({
	// @ts-ignore
	layout: 'empty',
	middleware: ['auth'],
});

const router = useRouter();
const poolStore = usePoolStore();
const { sessionItems } = storeToRefs(poolStore);

const loading = ref(true);
const items = computed(() => sessionItems.value);

onMounted(async () => {
	loading.value = true;
	// Normally PoolCard seeds sessionItems before navigating here. On a direct
	// visit (refresh / deep link) there's nothing staged, so fetch and run the
	// whole pool.
	if (!sessionItems.value.length) {
		await poolStore.fetchPool();
		poolStore.startSession();
	}
	loading.value = false;
});

async function handleComplete(phraseIds: string[]) {
	await poolStore.completeSession(phraseIds);
	router.push('/board');
}

function endSession() {
	router.push('/board');
}
</script>

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
