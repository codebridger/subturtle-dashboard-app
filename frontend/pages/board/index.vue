<template>
    <div class="container mx-auto px-4 py-8">
        <h1 class="mb-8 text-3xl font-bold text-gray-800 dark:text-white">
            {{ $t('activities.title') }}
        </h1>

        <div v-if="loading" class="flex justify-center py-12">
            <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
        </div>

        <div v-else-if="activities.length === 0"
            class="flex flex-col items-center justify-center rounded-xl bg-gray-50 py-12 text-center dark:bg-gray-800">
            <Icon name="iconify solar--rocket-2-bold-duotone" class="mb-4 text-6xl text-gray-300" />
            <p class="text-xl font-medium text-gray-500">{{ $t('board.no_activities') }}</p>
            <p class="mt-2 text-sm text-gray-400">{{ $t('board.all_caught_up') }}</p>
        </div>

        <div v-else class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div v-for="activity in activities" :key="activity._id"
                class="group relative overflow-hidden rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md dark:bg-gray-800">
                <div class="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary-50 dark:bg-primary-900/20"></div>

                <div class="relative z-10">
                    <div class="mb-4 flex items-center justify-between">
                        <div
                            class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-400">
                            <Icon v-if="activity.type === 'leitner_review'" name="iconify solar--box-bold-duotone"
                                class="text-2xl" />
                            <Icon v-else name="iconify solar--star-bold-duotone" class="text-2xl" />
                        </div>
                        <span v-if="activity.state === 'toasted'"
                            class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
                            {{ $t('board.due') }}
                        </span>
                    </div>

                    <h3 class="mb-2 text-lg font-bold text-gray-900 dark:text-white">
                        <span v-if="activity.type === 'leitner_review'">{{ $t('review.title') }}</span>
                        <span v-else>{{ activity.type }}</span>
                    </h3>

                    <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
                        <span v-if="activity.type === 'leitner_review' && activity.meta?.dueCount">
                            {{ $t('board.items_due', { count: activity.meta.dueCount }) }}
                        </span>
                        <span v-else>{{ $t('board.activity_ready') }}</span>
                    </p>

                    <button @click="handleStartActivity(activity)"
                        class="flex w-full items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-500">
                        {{ $t('board.start_activity') }}
                        <Icon name="heroicons:arrow-right" class="ml-2" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useLeitnerStore } from '~/stores/leitner';
import { type BoardActivityType } from '~/types/database.type';
import { storeToRefs } from 'pinia';

const { t } = useI18n();
const router = useRouter();
const leitnerStore = useLeitnerStore();
const { boardActivities } = storeToRefs(leitnerStore);

const loading = ref(true);

const activities = computed(() => boardActivities.value);

definePageMeta({
    layout: 'default',
    // @ts-ignore
    middleware: ['auth'],
});

onMounted(async () => {
    loading.value = true;
    // We should trigger a refresh check first?
    // Usually backend scheduler updates it, but frontend can also 'pull' or trigger a sync if needed.
    // Ideally, we just fetch what's there.
    // However, if the user just logged in, the trigger might have run.
    await leitnerStore.fetchBoard();
    loading.value = false;
});

async function handleStartActivity(activity: BoardActivityType) {
    // 1. Mark as consumed/started
    await leitnerStore.consumeActivity(activity.type, activity.refId);

    // 2. Navigate to the activity
    if (activity.type === 'leitner_review') {
        router.push('/practice/review'); // We need to create this or use proper route
    }
}
</script>
