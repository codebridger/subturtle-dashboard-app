<template>
    <div class="p-4">
        <h1 class="mb-6 text-lg font-bold">{{ t('statistic.your-statistic') }}</h1>
        <section class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-4">
            <Card class="col-span-1 rounded-md shadow-none lg:col-span-3">
                <WidgetActivityChartOverview title="Your last 7 days" />
            </Card>
            <Card class="max-h-min rounded-md shadow-none">
                <h1 class="text-lg font-bold">{{ t('statistic.quick-states.label') }}</h1>
                <div class="flex items-center space-x-4 rounded-md bg-gray-100 p-2 dark:bg-gray-900">
                    <IconButton icon="IconNotes" rounded="full" size="lg" class="text-secondary" />
                    <div class="flex flex-col items-start space-y-2">
                        <h1 class="text-lg font-bold">
                            {{ statistics.totalBundles }}
                        </h1>
                        <span class="text-gray-500">
                            {{ t('statistic.quick-states.total-bundles') }}
                        </span>
                    </div>
                </div>
                <div class="mt-2 flex items-center space-x-4 rounded-md bg-gray-100 p-2 dark:bg-gray-900">
                    <IconButton icon="IconClipboardText" rounded="full" size="lg" class="text-info" />
                    <div class="flex flex-col items-start space-y-2">
                        <h1 class="text-lg font-bold">
                            {{ statistics.totalPhrases }}
                        </h1>
                        <span class="text-gray-500">
                            {{ t('statistic.quick-states.total-phrases') }}
                        </span>
                    </div>
                </div>
            </Card>
        </section>
        <section>
            <h1 class="text-lg font-bold">{{ t('statistic.recent') }}</h1>
            <div class="grid w-full grid-cols-2 gap-4 lg:grid-cols-3">
                <BundleGenerativeCard v-for="bundle in recentBundles" :key="bundle._id" :bundle="bundle" />
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
    import { dataProvider, functionProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';
    import { FN, type UserStatisticType } from '~/types/function.type';
    import { Card, IconButton, Icon } from '@codebridger/lib-vue-components/elements.ts';
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('statistic.your-statistic'),
        // @ts-ignore
        middleware: ['auth'],
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
