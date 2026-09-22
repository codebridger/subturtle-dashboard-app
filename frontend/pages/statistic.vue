<template>
    <div class="flex flex-col gap-[22px]">
        <StPageHeader
            :title="t('statistic.your-statistic')"
            :overline="t('statistic.overline')"
            :subtitle="t('statistic.subtitle')"
        >
            <template v-if="showInstallCta" #actions>
                <StButton variant="outline" color="primary" icon="solar:download-minimalistic-bold" @click="installExtension">
                    {{ t('statistic.install-extension') }}
                </StButton>
            </template>
        </StPageHeader>

        <div class="flex flex-wrap items-stretch gap-[14px]">
            <!-- Chart column -->
            <div class="flex min-w-0 flex-[2_1_440px] flex-col">
                <StSkeleton v-if="loading" class="h-[420px]" />

                <StCard v-else-if="locked && !lockDismissed" padding="lg" class="flex h-full flex-col justify-center">
                    <div class="mx-auto flex max-w-[27rem] flex-col items-center py-8 text-center">
                        <span class="mb-[18px] inline-flex h-[60px] w-[60px] items-center justify-center rounded-st-lg bg-st-primary-soft">
                            <StIcon name="solar:lock-keyhole-minimalistic-bold-duotone" :size="32" class="text-st-rose-600" />
                        </span>
                        <h2 class="mb-2 font-st-display text-st-lg font-black tracking-st-tight text-st-strong">
                            {{ t('statistic.locked.title') }}
                        </h2>
                        <p class="mb-5 text-st-base font-semibold leading-[1.55] text-st-muted [text-wrap:pretty]">
                            {{ t('statistic.locked.description') }}
                        </p>
                        <div class="flex flex-wrap justify-center gap-[10px]">
                            <StButton color="primary" icon="solar:crown-bold" @click="goToPlans">
                                {{ t('statistic.locked.upgrade') }}
                            </StButton>
                            <StButton variant="ghost" color="neutral" @click="lockDismissed = true">
                                {{ t('statistic.locked.later') }}
                            </StButton>
                        </div>
                    </div>
                </StCard>

                <StCard v-else-if="isEmpty" padding="none">
                    <StEmptyState
                        icon="solar:chart-2-bold-duotone"
                        :title="t('statistic.empty.chart.title')"
                        :description="t('statistic.empty.chart.description')"
                    >
                        <template #action>
                            <StButton color="primary" icon="solar:download-minimalistic-bold" @click="installExtension">
                                {{ t('statistic.empty.chart.cta') }}
                            </StButton>
                        </template>
                    </StEmptyState>
                </StCard>

                <StCard v-else-if="!locked" padding="lg" class="flex h-full flex-col">
                    <div class="mb-[34px] flex items-start justify-between gap-4">
                        <div>
                            <h2 class="font-st-display text-st-lg font-black tracking-st-tight text-st-strong">
                                {{ t('statistic.chart.title') }}
                            </h2>
                            <p class="mt-1.5 text-st-base font-semibold text-st-muted">
                                {{ t('statistic.chart.subtitle') }}
                            </p>
                        </div>
                        <StBadge v-if="weekDelta !== null" :color="weekDelta < 0 ? 'danger' : 'accent'" :icon="weekDelta < 0 ? 'solar:arrow-down-bold' : 'solar:arrow-up-bold'" class="shrink-0">
                            {{ t('statistic.chart.delta', { delta: formattedDelta }) }}
                        </StBadge>
                    </div>

                    <WidgetWeekActivityChart :days="week" />
                </StCard>
            </div>

            <!-- Stat tiles -->
            <div class="flex min-w-0 flex-[1_1_230px] flex-col gap-[14px]">
                <template v-if="loading">
                    <StSkeleton v-for="n in 3" :key="n" class="min-h-[120px] flex-1" />
                </template>
                <template v-else>
                    <StStatTile
                        icon="solar:bookmark-bold-duotone"
                        :value="locked ? '—' : totals.totalPhrases"
                        :label="t('statistic.tiles.phrases')"
                        :trend="phrasesTrend"
                    />
                    <StStatTile
                        icon="solar:fire-bold-duotone"
                        accent="accent"
                        :value="locked ? '—' : streak"
                        :label="t('statistic.tiles.streak')"
                    />
                    <StStatTile
                        icon="solar:layers-minimalistic-bold-duotone"
                        accent="warning"
                        :value="dueToday"
                        :label="t('statistic.tiles.due')"
                    >
                        <template #action>
                            <StIconButton
                                icon="solar:play-bold"
                                color="primary"
                                variant="solid"
                                rounded="full"
                                size="lg"
                                :disabled="dueToday === 0"
                                :aria-label="t('statistic.start-review')"
                                @click="startReview"
                            />
                        </template>
                    </StStatTile>
                </template>
            </div>
        </div>

        <!-- Bundles -->
        <section>
            <div class="mb-[14px] flex items-baseline justify-between gap-4">
                <h2 class="font-st-display text-st-lg font-black tracking-st-tight text-st-strong">
                    {{ t('statistic.bundles.title') }}
                </h2>
                <NuxtLink to="/bundles" class="text-st-sm font-bold text-st-link hover:underline">
                    {{ seeAllLabel }}
                </NuxtLink>
            </div>

            <div v-if="loading" class="grid grid-cols-2 gap-[14px] lg:grid-cols-3">
                <StSkeleton v-for="n in 3" :key="n" class="h-[190px]" />
            </div>

            <div v-else-if="recentBundles.length" class="grid grid-cols-2 gap-[14px] lg:grid-cols-3">
                <BundleGenerativeCard v-for="bundle in recentBundles" :key="bundle._id" :bundle="bundle" />
            </div>

            <StCard v-else padding="none">
                <StEmptyState
                    icon="solar:notebook-bold-duotone"
                    color="neutral"
                    :title="t('statistic.empty.bundles.title')"
                    :description="t('statistic.empty.bundles.description')"
                />
            </StCard>
        </section>
    </div>
</template>

<script setup lang="ts">
    import { dataProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';
    import { StBadge, StButton, StCard, StEmptyState, StIcon, StIconButton, StSkeleton, StStatTile } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import { useInlineFeatureLock } from '~/composables/useTierLimitModal';
    import { useProgressSummary } from '~/composables/useProgressSummary';
    import { useLeitnerStore } from '~/stores/leitner';

    const { t } = useI18n();
    const router = useRouter();
    const config = useRuntimeConfig();
    const { extensionPresent } = useExtensionPresence();
    const leitner = useLeitnerStore();

    definePageMeta({
        layout: 'default',
        title: () => t('statistic.your-statistic'),
        // @ts-ignore
        middleware: ['auth'],
    });

    const { loading, locked, totals, week, streak, weekDelta, load } = useProgressSummary();

    // weekly_insights renders as an inline locked card here, so the global tier-limit modal
    // defers to it (no double upsell on the same lock).
    useInlineFeatureLock('weekly_insights');

    const recentBundles = ref<PhraseBundleType[]>([]);
    const totalBundles = ref(0);
    const lockDismissed = ref(false);

    const showInstallCta = computed(() => extensionPresent.value === false);
    const isEmpty = computed(() => !locked.value && totals.value.totalPhrases === 0 && recentBundles.value.length === 0);

    // Signed, so the pill reads "+18% vs last week"; the badge icon repeats the direction.
    const formattedDelta = computed(() => (weekDelta.value === null ? '' : `${weekDelta.value > 0 ? '+' : ''}${weekDelta.value}`));
    const phrasesTrend = computed(() => (weekDelta.value === null ? null : `${weekDelta.value < 0 ? '-' : '+'}${Math.abs(weekDelta.value)}%`));

    /** The board's leitner_review activity is the same source /board counts from. */
    const dueToday = computed(
        () => leitner.boardActivities.find((a) => a.type === 'leitner_review')?.meta?.dueCount ?? 0
    );

    const seeAllLabel = computed(() =>
        totalBundles.value > recentBundles.value.length
            ? t('statistic.bundles.see-all', { count: totalBundles.value })
            : t('statistic.bundles.go')
    );

    function installExtension() {
        window.open(config.public.chromeWebStoreUrl as string, '_blank', 'noopener,noreferrer');
    }

    function goToPlans() {
        router.push('/settings/subscription');
    }

    function startReview() {
        router.push('/practice/review');
    }

    async function getRecentBundles() {
        const [recent, all] = await Promise.all([
            dataProvider.find<PhraseBundleType>({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PHRASE_BUNDLE,
                query: { refId: authUser.value?.id },
                options: { limit: 3, sort: { updatedAt: -1 } },
            }),
            dataProvider.count({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PHRASE_BUNDLE,
                query: { refId: authUser.value?.id },
            }),
        ]);

        recentBundles.value = recent;
        totalBundles.value = Number(all) || recent.length;
    }

    onMounted(() => {
        getRecentBundles();
        load();
        // The board is fetched once by the layout (it feeds the sidebar badge); this page
        // just reads the same store.
    });
</script>
