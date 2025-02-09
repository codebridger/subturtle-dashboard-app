<template>
    <section :class="['flex w-full flex-col items-start space-y-4', 'md:flex-row md:space-x-4 md:space-y-0']">
        <!-- <WidgetActivityChartOverview class="flex-1" title="Your last 7 days" /> -->

        <Card class="flax w-full flex-col space-y-2 p-6 md:w-64">
            <h1>{{ t('dashboard.quick-states.label') }}</h1>

            <div class="flex items-center space-x-2 rounded-md bg-gray-100 p-3 dark:bg-gray-900">
                <Icon name="IconNotes" />
                {{ statistics.totalBundles }}
                {{ t('dashboard.quick-states.total-bundles') }}
            </div>

            <div class="flex items-center space-x-2 rounded-md bg-gray-100 p-3 dark:bg-gray-900">
                <Icon name="IconClipboardText" />
                {{ statistics.totalPhrases }}
                {{ t('dashboard.quick-states.total-phrases') }}
            </div>
        </Card>
    </section>

    <div class="mb-2 mt-4 flex justify-between">
        <h1>{{ t('dashboard.recent') }}</h1>
    </div>
    <section class="tablet:grid-cols-2 grid w-full gap-4 lg:grid-cols-3">
        <BundleGenerativeCard v-for="bundle in recentBundles" :key="bundle._id" :bundle="bundle" />
    </section>
</template>

<script setup lang="ts">
    import { dataProvider, functionProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';
    import { FN, type UserStatisticType } from '~/types/function.type';
    import { Card, Icon } from '@tiny-ideas-ir/lib-vue-components/elements.ts';
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('statistics'),
        // @ts-ignore
        middleware: ['auth'],
    });

    // meta information can also be added to the head
    useHead({
        meta: [{ name: 'description', content: 'Subturtle popup app' }],
    });

    const recentBundles = ref<PhraseBundleType[]>([]);
    const statistics = ref<UserStatisticType>({
        totalPhrases: 0,
        totalBundles: 0,
    });

    function getRecentBundles() {
        dataProvider
            .find<PhraseBundleType>({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PHRASE_BUNDLE,
                query: {
                    refId: authUser.value?.id,
                },
                options: {
                    limit: 3,
                    sort: {
                        updatedAt: -1,
                    },
                },
            })
            .then((data) => {
                recentBundles.value = data;
            });
    }

    function getUserStatistics() {
        functionProvider
            .run<UserStatisticType>({
                name: FN.getUserStatistic,
                args: {
                    userId: authUser.value?.id,
                },
            })
            .then((data) => {
                statistics.value = data;
            });
    }

    onMounted(() => {
        getRecentBundles();
        getUserStatistics();
    });
</script>
