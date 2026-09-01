<template>
    <div class="flex flex-col gap-[22px]">
        <StPageHeader :title="t('board.title')" :overline="t('board.overline')" :subtitle="t('board.subtitle')" />

        <!-- Loading: two placeholder rows, matching the design's `.sk` blocks. -->
        <div v-if="loading" class="flex flex-col gap-[14px]">
            <StSkeleton v-for="n in 2" :key="n" class="h-[104px]" />
        </div>

        <!-- Populated: "Due today" and "Optional practice" travel together — the design gates both
             on the same `listShow`, so neither appears beside the caught-up card. -->
        <template v-else-if="activities.length || poolCount">
            <!-- One card per board activity — the design's three fixed cards are demo data; the
                 board only ever returns the types the server actually raised. PoolCard sits in the
                 same grid and renders nothing when the pool is empty. -->
            <section>
                <h2 class="mb-[14px] text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">
                    {{ t('board.due_today') }}
                </h2>

                <!-- Cards stretch (the design's default) so every `mt-auto` footer lands on the
                     same baseline across the row. -->
                <div class="grid gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                    <StCard v-for="activity in activities" :key="activity._id" class="flex flex-col">
                        <div class="mb-5 flex items-start justify-between gap-3">
                            <span
                                class="inline-flex h-[54px] w-[54px] items-center justify-center rounded-st-md"
                                :class="isReview(activity) ? 'bg-st-warning-soft text-st-amber-600' : 'bg-st-primary-soft text-st-rose-600'"
                            >
                                <StIcon :name="isReview(activity) ? 'solar:layers-minimalistic-bold-duotone' : 'solar:play-bold'" :size="29" />
                            </span>
                            <StBadge v-if="activity.state === 'toasted'" color="warning">{{ t('board.due') }}</StBadge>
                        </div>

                        <h3 class="mb-1.5 text-st-md font-extrabold text-st-strong">
                            {{ isReview(activity) ? t('smart_review.title') : activity.type }}
                        </h3>
                        <p class="mb-[18px] text-st-sm font-semibold text-st-muted [text-wrap:pretty]">
                            {{
                                isReview(activity) && activity.meta?.dueCount
                                    ? t('board.items_due', { count: activity.meta.dueCount })
                                    : t('board.activity_ready')
                            }}
                        </p>

                        <div class="mt-auto">
                            <StButton color="primary" icon="solar:play-bold" block @click="handleStartActivity(activity)">
                                {{ isReview(activity) ? t('board.start_review') : t('board.start_activity') }}
                            </StButton>
                        </div>
                    </StCard>

                    <!-- Pool encode queue — self-contained, shows only when the pool is non-empty.
                         Still pilotui; it gets its own migration PR. -->
                    <PoolCard />
                </div>
            </section>

            <!-- Optional practice. The design shows three tiles; only Flashcards has a route that
                 works as an entry point, so it is the only one kept — see the PR notes. -->
            <section>
                <h2 class="mb-[14px] text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">
                    {{ t('board.optional_practice') }}
                </h2>

                <div class="grid items-start gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                    <StCard class="flex flex-col">
                        <span class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-st-md bg-st-info-soft text-st-sky-600">
                            <StIcon name="solar:card-2-bold-duotone" :size="26" />
                        </span>
                        <h3 class="mb-[5px] text-st-base font-extrabold text-st-strong">
                            {{ t('board.practice.flashcards.title') }}
                        </h3>
                        <p class="mb-4 text-st-sm font-semibold text-st-muted [text-wrap:pretty]">
                            {{ t('board.practice.flashcards.description') }}
                        </p>
                        <div class="mt-auto">
                            <StButton variant="ghost" color="neutral" size="sm" @click="router.push('/practice/bundle-review')">
                                {{ t('board.practice.flashcards.cta') }}
                            </StButton>
                        </div>
                    </StCard>
                </div>
            </section>
        </template>

        <StCard v-else padding="none">
            <StEmptyState icon="solar:check-circle-bold-duotone" color="accent" :title="t('board.empty.title')" :description="t('board.empty.description')">
                <template #action>
                    <StButton variant="outline" color="primary" icon="solar:notebook-bold" @click="router.push('/bundles')">
                        {{ t('board.empty.cta') }}
                    </StButton>
                </template>
            </StEmptyState>
        </StCard>
    </div>
</template>

<script setup lang="ts">
    import { useLeitnerStore } from '~/stores/leitner';
    import { usePoolStore } from '~/stores/pool';
    import { type BoardActivityType } from '~/types/database.type';
    import { storeToRefs } from 'pinia';
    import { StBadge, StButton, StCard, StEmptyState, StIcon, StSkeleton } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';

    const { t } = useI18n();
    const router = useRouter();
    const leitnerStore = useLeitnerStore();
    const poolStore = usePoolStore();
    const { boardActivities } = storeToRefs(leitnerStore);
    const { poolCount } = storeToRefs(poolStore);

    const loading = ref(true);

    const activities = computed(() => boardActivities.value);

    /** The only type the server raises today; everything else renders as a generic card. */
    function isReview(activity: BoardActivityType) {
        return activity.type === 'leitner_review';
    }

    definePageMeta({
        layout: 'default',
        // @ts-ignore
        middleware: ['auth'],
    });

    onMounted(async () => {
        loading.value = true;
        try {
            await Promise.all([leitnerStore.fetchBoard(), poolStore.fetchPool()]);
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
