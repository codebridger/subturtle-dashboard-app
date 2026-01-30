<template>
    <div class="relative min-h-screen overflow-hidden">
        <!-- Decorative Background Elements -->
        <div
            class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none">
        </div>
        <div
            class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px] pointer-events-none">
        </div>

        <div class="container relative mx-auto px-6 py-16 max-w-7xl">
            <!-- Header Section -->
            <div class="mb-14 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div class="flex flex-col gap-3">
                    <div class="flex items-center gap-2">
                        <div class="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                        <span class="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Mission
                            Control</span>
                    </div>
                    <h1
                        class="text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                        {{ $t('activities.title') }}
                    </h1>
                    <p class="text-lg text-gray-500 dark:text-gray-400 font-medium max-w-md">
                        Your daily language mission and progress tracker. Stay consistent, stay ahead.
                    </p>
                </div>
                <div class="hidden md:flex flex-col items-end gap-2">
                    <div class="h-1.5 w-32 bg-gradient-to-r from-primary to-secondary rounded-full"></div>
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Active System</span>
                </div>
            </div>

            <!-- Loading State -->
            <div v-if="loading" class="flex flex-col items-center justify-center py-32 gap-6">
                <div class="relative">
                    <div
                        class="h-20 w-20 animate-[spin_3s_linear_infinite] rounded-full border-[3px] border-primary/5 border-t-primary">
                    </div>
                    <div
                        class="h-20 w-20 absolute inset-0 animate-[spin_2s_linear_infinite] rounded-full border-[3px] border-transparent border-b-secondary opacity-40">
                    </div>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <Icon name="IconBolt" class="w-8 h-8 text-primary animate-pulse" />
                    </div>
                </div>
                <div class="flex flex-col items-center gap-1">
                    <p class="text-xs font-black text-primary uppercase tracking-[0.3em] animate-pulse">Synchronizing
                    </p>
                    <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Mission Data Feed</p>
                </div>
            </div>

            <!-- Empty State -->
            <div v-else-if="activities.length === 0" class="max-w-3xl mx-auto">
                <Card
                    class="relative group flex flex-col items-center justify-center py-24 px-10 text-center bg-white/40 dark:bg-gray-800/40 backdrop-blur-2xl border-2 border-dashed border-gray-200/60 dark:border-gray-700/60 rounded-[3rem] overflow-hidden shadow-2xl shadow-gray-200/20 dark:shadow-none transition-all duration-700 hover:border-primary/30">
                    <!-- Subtle background glow for empty state -->
                    <div
                        class="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
                    </div>

                    <div class="relative mb-10">
                        <div
                            class="absolute inset-0 bg-primary blur-3xl opacity-20 group-hover:opacity-30 transition-opacity">
                        </div>
                        <div
                            class="relative h-24 w-24 rounded-3xl bg-gradient-to-br from-primary to-primary-light flex items-center justify-center shadow-2xl shadow-primary/30 group-hover:scale-110 transition-transform duration-700">
                            <Icon name="iconify solar--rocket-2-bold-duotone" class="text-5xl text-white" />
                        </div>
                    </div>

                    <div class="relative z-10 max-w-md">
                        <h2 class="text-3xl font-black text-gray-900 dark:text-white mb-4 tracking-tight">
                            {{ $t('board.no_activities') }}
                        </h2>
                        <p class="text-gray-500 dark:text-gray-400 font-medium mb-10 leading-relaxed text-lg">
                            {{ $t('board.all_caught_up') }} Take this moment to explore new phrases.
                        </p>
                    </div>
                </Card>
            </div>

            <!-- Activities Grid -->
            <div v-else-if="activities && activities.length > 0" class="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
                <div v-for="(activity, index) in activities" :key="activity._id" class="group h-full animate-fade-in-up"
                    :style="{ animationDelay: `${index * 150}ms`, opacity: 0 }">
                    <Card
                        class="relative h-full flex flex-col overflow-hidden rounded-[2.5rem] bg-white dark:bg-gray-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_40px_80px_rgba(var(--primary-rgb),0.15)] transition-all duration-700 hover:-translate-y-3 cursor-default p-0 group border-0">

                        <!-- Card Accent Header -->
                        <div class="h-32 w-full relative overflow-hidden shrink-0 rounded-t-[2rem]">
                            <div
                                class="absolute inset-0 bg-gradient-to-br from-primary via-primary-dark to-secondary opacity-100 group-hover:scale-110 transition-transform duration-1000">
                            </div>

                            <!-- Animated pattern overlay -->
                            <div
                                class="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]">
                            </div>

                            <div class="absolute top-6 right-6 z-20">
                                <span v-if="activity.state === 'toasted'"
                                    class="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-2xl text-[10px] font-black text-white uppercase tracking-[0.2em] border border-white/20 shadow-xl shadow-black/10">
                                    <div class="h-1.5 w-1.5 rounded-full bg-white animate-pulse"></div>
                                    {{ $t('board.due') }}
                                </span>
                            </div>

                            <!-- Big symbolic background icon -->
                            <div
                                class="absolute -left-6 -bottom-10 opacity-10 scale-150 group-hover:rotate-12 transition-transform duration-1000">
                                <Icon v-if="activity.type === 'leitner_review'" name="IconArchive"
                                    class="w-32 h-32 text-white" />
                                <Icon v-else name="IconStar" class="w-32 h-32 text-white" />
                            </div>

                            <!-- Bottom transition gradient mask -->
                            <div
                                class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-gray-800 to-transparent opacity-30">
                            </div>
                        </div>

                        <!-- Main Content -->
                        <div
                            class="p-10 pb-12 flex flex-col flex-grow relative -mt-8 bg-white dark:bg-gray-800 rounded-t-[3rem] z-10 border-t border-white/10">
                            <!-- Floating Glass Icon -->
                            <div class="absolute -top-12 left-10 h-24 w-24">
                                <div
                                    class="h-24 w-24 bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl flex items-center justify-center border border-gray-50 dark:border-gray-800 ring-8 ring-white/10 dark:ring-gray-900/10 group-hover:scale-105 transition-transform duration-500">
                                    <Icon v-if="activity.type === 'leitner_review'"
                                        name="iconify solar--box-bold-duotone" class="text-4xl text-primary" />
                                    <Icon v-else name="iconify solar--star-bold-duotone"
                                        class="text-4xl text-primary" />
                                </div>
                            </div>

                            <div class="mt-10 mb-8">
                                <div class="flex items-center gap-2 mb-3">
                                    <span class="text-[10px] font-bold text-primary uppercase tracking-widest">Training
                                        Module</span>
                                    <div class="h-px flex-grow bg-gray-100 dark:bg-gray-700/50"></div>
                                </div>
                                <h3
                                    class="text-2xl font-black text-gray-900 dark:text-white mb-3 tracking-tight group-hover:text-primary transition-colors">
                                    <span v-if="activity.type === 'leitner_review'">{{ $t('review.title') }}</span>
                                    <span v-else>{{ activity.type }}</span>
                                </h3>
                                <p class="text-base font-medium text-gray-500 dark:text-gray-400 leading-relaxed">
                                    <span v-if="activity.type === 'leitner_review' && activity.meta?.dueCount"
                                        class="flex items-center gap-2">
                                        <Icon name="iconify solar--checklist-minimalistic-bold-duotone"
                                            class="w-5 h-5 opacity-60" />
                                        {{ $t('board.items_due', { count: activity.meta.dueCount }) }}
                                    </span>
                                    <span v-else class="flex items-center gap-2">
                                        <Icon name="iconify solar--check-circle-bold-duotone"
                                            class="w-5 h-5 text-green-500" />
                                        {{ $t('board.activity_ready') }}
                                    </span>
                                </p>
                            </div>

                            <!-- Footer / Action -->
                            <div class="mt-auto pt-8">
                                <Button @click="handleStartActivity(activity)" block size="lg"
                                    class="h-16 rounded-2xl font-black bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-primary dark:hover:bg-primary hover:text-white dark:hover:text-white transition-all duration-300 active:scale-95 shadow-xl hover:shadow-primary/30 group/btn overflow-hidden">
                                    <div class="flex items-center justify-center gap-3 relative z-10">
                                        <Icon name="iconify solar--play-circle-bold"
                                            class="w-6 h-6 group-hover/btn:rotate-12 transition-transform" />
                                        {{ $t('board.start_activity') }}
                                    </div>
                                    <div
                                        class="absolute inset-0 bg-primary opacity-0 group-hover/btn:opacity-100 transition-opacity">
                                    </div>
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useLeitnerStore } from '~/stores/leitner';
import { type BoardActivityType } from '~/types/database.type';
import { storeToRefs } from 'pinia';
import { Card, Button, Icon } from '@codebridger/lib-vue-components/elements.ts';

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
    try {
        await leitnerStore.fetchBoard();
    } catch (e) {
        console.error('Failed to fetch board:', e);
    } finally {
        loading.value = false;
    }
});

async function handleStartActivity(activity: BoardActivityType) {
    try {
        // 1. Mark as consumed/started
        await leitnerStore.consumeActivity(activity.type, activity.refId);

        // 2. Navigate to the activity
        if (activity.type === 'leitner_review') {
            router.push('/practice/review');
        }
    } catch (e) {
        console.error('Failed to start activity:', e);
    }
}
</script>

<style scoped>
.animate-fade-in-up {
    animation: fade-in-up 0.6s ease-out forwards;
}

@keyframes fade-in-up {
    from {
        opacity: 0;
        transform: translateY(30px) scale(0.95);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

:root {
    --primary-rgb: 79, 70, 229;
    /* Adjust to match your primary theme color */
}
</style>
