<template>
    <div class="p-4">
        <!-- Left section -->
        <div v-if="!isEmptyState" class="mb-4 flex items-center justify-between gap-4">
            <div>
                <div class="flex items-center gap-1">
                    <Icon name="IconMultipleForwardRight" class="h-6 w-6" />
                    <h1 class="text-2xl font-bold">{{ t('live-session.your-sessions') }}</h1>
                </div>
                <p>{{ t('live-session.6-months-expiry') }}</p>
            </div>
        </div>

        <!-- Empty State -->
        <div v-if="isEmptyState" class="flex flex-1 flex-col items-center justify-center">
            <div class="flex max-w-xl flex-col items-center justify-center py-12 text-center">
                <img
                    class="mx-auto h-48 w-auto dark:hidden"
                    src="/assets/images/illustrations/placeholders/flat/placeholder-search-3.svg"
                    alt="No sessions available"
                />
                <img
                    class="mx-auto hidden h-48 w-auto dark:block"
                    src="/assets/images/illustrations/placeholders/flat/placeholder-search-3-dark.svg"
                    alt="No sessions available"
                />
                <h3 class="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{{ t('live-session.no-sessions') }}</h3>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {{ t('live-session.no-sessions-description') }}
                </p>
                <div class="mt-6">
                    <Button color="primary" iconName="IconPlay" :label="t('live-session.start-first-session')" @click="goToBundles" />
                </div>
            </div>
        </div>

        <!-- Sessions List -->
        <div v-else class="max-w-2xl space-y-4">
            <div v-for="session in sessionList" :key="session._id" class="rounded-lg bg-white p-4 shadow transition-shadow hover:shadow-md dark:bg-gray-800">
                <NuxtLink :to="`/sessions/${session._id}`" class="block">
                    <!-- Header with Type and Date -->
                    <div class="mb-3 flex items-baseline justify-between">
                        <div class="flex items-center gap-2">
                            <span class="rounded-lg bg-blue-100 px-2 py-1 text-xs font-medium uppercase text-blue-600 dark:bg-blue-900 dark:text-blue-400">
                                {{ session.type }}
                            </span>
                            <span class="text-sm text-gray-600 dark:text-gray-400">
                                {{ new Date(session.createdAt).toLocaleString() }}
                            </span>
                        </div>
                        <div class="">
                            <span class="text-sm text-gray-600 dark:text-gray-400"> {{ session.dialogs.length || 0 }} {{ t('live-session.dialogs') }} </span>
                            <Icon name="IconChevronRight" class="h-5 w-5" />
                        </div>
                    </div>

                    <!-- Session Metadata -->
                    <div v-if="isPracticeSession(session)" class="mt-2 flex flex-wrap justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <div>
                            <span class="font-medium">{{ t('live-session.ai-character') }}:</span>
                            <span class="ml-1">{{ session.metadata.aiCharacter || '-' }}</span>
                        </div>
                        <div>
                            <span class="font-medium">{{ t('live-session.selection-mode') }}:</span>
                            <span class="ml-1 capitalize">{{ session.metadata.selectionMode || '-' }}</span>
                        </div>
                        <div v-if="session.session.totalPhrases">
                            <span class="font-medium">{{ t('live-session.total-phrases') }}:</span>
                            <span class="ml-1">{{ session.metadata.totalPhrases || '-' }}</span>
                        </div>
                        <div v-if="session.metadata.selectionMode === 'selection'">
                            <span class="font-medium">{{ t('live-session.phrase-range') }}:</span>
                            <span class="ml-1">{{ session.metadata.fromPhrase || '-' }} - {{ session.metadata.toPhrase || '-' }}</span>
                        </div>
                    </div>
                </NuxtLink>
            </div>
        </div>

        <!-- Pagination -->
        <div v-if="pagination && !isEmptyState" class="mt-6 max-w-2xl">
            <Pagination v-model="controller.pagination.page" :totalPages="controller.pagination.pages" @change-page="controller.fetchPage($event)" />
        </div>
    </div>
</template>

<script setup lang="ts">
    import { Icon, Button } from '@codebridger/lib-vue-components/elements.ts';
    import { Pagination } from '@codebridger/lib-vue-components/complex.ts';
    import { dataProvider } from '@modular-rest/client';
    import type { PaginationType } from '@modular-rest/client/dist/types/types';
    import { COLLECTIONS, DATABASE } from '~/types/database.type';
    import type { LiveSessionRecordType, LivePracticeSessionSetupType } from '~/types/live-session.type';

    const { t } = useI18n();
    const router = useRouter();

    definePageMeta({
        layout: 'default',
        title: () => t('session.history'),
        middleware: ['auth'],
    });

    const perPage = ref(20);
    const sessionList = ref<LiveSessionRecordType[]>([]);
    const pagination = ref<PaginationType | null>(null);
    const isLoading = ref(false);
    const isEmptyState = computed(() => !sessionList.value.length && !isLoading.value);

    // Type guard for practice sessions
    const isPracticeSession = (session: LiveSessionRecordType): session is LiveSessionRecordType & { session: LivePracticeSessionSetupType } => {
        return session.type === 'bundle-practice' && !!session.session;
    };

    const controller = dataProvider.list<LiveSessionRecordType>(
        {
            database: DATABASE.USER_CONTENT,
            collection: COLLECTIONS.LIVE_SESSION,
            query: {
                refId: authUser.value?.id,
                // where dialogs atleast contains one object with speaker:"user"
                dialogs: { $elemMatch: { speaker: 'user' } },
            },
            options: {
                sort: {
                    createdAt: -1,
                },
            },
        },
        {
            limit: perPage.value,
            page: 1,
            onFetched: (data) => {
                sessionList.value = data;
                pagination.value = controller.pagination;
            },
        }
    );

    onMounted(async () => {
        isLoading.value = true;
        await Promise.all([
            // update pagination
            controller.updatePagination(),
            // fetch first page
            controller.fetchPage(1),
        ]).finally(() => {
            isLoading.value = false;
        });
    });

    function goToBundles() {
        router.push('/bundles');
    }
</script>
