<template>
    <div class="flex flex-col gap-[22px]">
        <StPageHeader :title="t('board.title')" :overline="overline" :subtitle="subtitle" />

        <!-- Loading, and while a language switch reloads the board: never two languages at once. -->
        <div v-if="loading || language.switching" class="flex flex-col gap-[14px]">
            <StSkeleton v-for="n in 2" :key="n" class="h-[104px]" />
        </div>

        <!-- New language, no phrases yet (D-11, Q5): ask for a first phrase and offer the starter
             pack. Never an empty "all caught up" board. -->
        <template v-else-if="isNewLanguage">
            <section class="grid gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]" data-testid="board-new-language">
                <StCard class="flex flex-col">
                    <span class="mb-5 inline-flex h-[54px] w-[54px] items-center justify-center rounded-st-md bg-st-primary-soft text-st-rose-600">
                        <StIcon name="solar:bookmark-bold-duotone" :size="29" />
                    </span>
                    <h3 class="mb-1.5 text-st-md font-extrabold text-st-strong">{{ t('languages.board.new-title', { language: activeName }) }}</h3>
                    <p class="mb-[18px] text-st-sm font-semibold text-st-muted [text-wrap:pretty]">{{ t('languages.board.new-body', { language: activeName }) }}</p>
                    <div class="mt-auto">
                        <StButton variant="outline" color="primary" icon="solar:notebook-bold" block @click="router.push('/bundles')">
                            {{ t('languages.board.new-bundles') }}
                        </StButton>
                    </div>
                </StCard>
                <StarterPackCard v-if="showPackCard" />
            </section>
        </template>

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
                    <StarterPackCard v-if="showPackCard" />
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

                    <!-- The Coach cards (D-11) open Start a session; each hides when the active
                         language has no Coach in that mode (contract section 5). -->
                    <StCard v-for="card in coachCards" :key="card.key" class="flex flex-col">
                        <span class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-st-md" :class="card.tint">
                            <StIcon :name="card.icon" :size="26" />
                        </span>
                        <h3 class="mb-[5px] text-st-base font-extrabold text-st-strong">{{ card.title }}</h3>
                        <p class="mb-4 text-st-sm font-semibold text-st-muted [text-wrap:pretty]">{{ card.body }}</p>
                        <div class="mt-auto">
                            <StButton variant="ghost" color="neutral" size="sm" @click="router.push(card.to)">{{ card.cta }}</StButton>
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
    import StarterPackCard from '~/components/language/StarterPackCard.vue';
    import { useLanguageStore } from '~/stores/language';

    const { t } = useI18n();
    const router = useRouter();
    const leitnerStore = useLeitnerStore();
    const poolStore = usePoolStore();
    const { boardActivities, newLanguage } = storeToRefs(leitnerStore);
    const language = useLanguageStore();
    const { poolCount } = storeToRefs(poolStore);

    const loading = ref(true);

    const activities = computed(() => boardActivities.value);

    const activeName = computed(() => language.nameOf(language.activeLanguage));

    /** The eyebrow names the language (D-11) once the learner can have more than one. */
    const overline = computed(() => (language.enabled ? t('languages.board.overline', { language: activeName.value }) : t('board.overline')));

    /** A language with no phrases yet: get-board says so, or the switcher's phrase count does. */
    const isNewLanguage = computed(
        () => language.enabled && !activities.value.length && !poolCount.value && (newLanguage.value || language.activeSummary?.phraseCount === 0)
    );

    const subtitle = computed(() => {
        const summary = language.activeSummary;
        if (isNewLanguage.value && summary) {
            const key = summary.startLevelSource === 'test' ? 'languages.board.new-sub-test' : 'languages.board.new-sub';
            return t(key, { language: activeName.value, level: summary.startLevel });
        }
        return t('board.subtitle');
    });

    /** The starter pack is an offer, never a gate (Q5): shown until it is done or skipped. */
    const showPackCard = computed(() => {
        if (!language.enabled || !language.features().starterPack) return false;
        const state = language.activeSummary?.starterPack?.state ?? 'none';
        return state !== 'done' && state !== 'skipped';
    });

    const coachCards = computed(() => {
        if (!language.enabled) return [];
        const f = language.features();
        const cards = [];
        if (f.coachVoice) {
            cards.push({
                key: 'live',
                icon: 'solar:microphone-3-bold-duotone',
                tint: 'bg-st-accent-soft text-st-jade-600',
                title: t('languages.board.practice-live-title'),
                body: t('languages.board.practice-live-body'),
                cta: t('languages.board.practice-live-cta'),
                to: '/sessions/new',
            });
        }
        if (f.coachText) {
            cards.push({
                key: 'text',
                icon: 'solar:chat-round-line-bold-duotone',
                tint: 'bg-st-primary-soft text-st-rose-600',
                title: t('languages.board.practice-text-title'),
                body: t('languages.board.practice-text-body'),
                cta: t('languages.board.practice-text-cta'),
                to: '/sessions/new?mode=text',
            });
        }
        return cards;
    });

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
