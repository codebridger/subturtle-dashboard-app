<template>
    <div class="relative min-h-screen">
        <!-- Decorative Background Elements -->
        <div
            class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none">
        </div>
        <div
            class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px] pointer-events-none">
        </div>

        <div class="container relative mx-auto px-6 py-16 max-w-7xl">
            <PageHeader :title="t('live-session.your-sessions')" :subtitle="t('live-session.6-months-expiry')"
                overline="LIVE SESSIONS" />

            <!-- Empty State -->
            <div v-if="isEmptyState" class="flex flex-1 flex-col items-center justify-center py-12">
                <div
                    class="flex max-w-xl flex-col items-center justify-center rounded-3xl border border-white/20 bg-white/40 p-12 text-center shadow-xl backdrop-blur-md dark:bg-gray-800/40">
                    <!-- Decorative blob for empty state -->
                    <div
                        class="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 blur-2xl">
                    </div>

                    <img class="mx-auto h-48 w-auto dark:hidden"
                        src="/assets/images/illustrations/placeholders/flat/placeholder-search-3.svg"
                        alt="No sessions available" />
                    <img class="mx-auto hidden h-48 w-auto dark:block"
                        src="/assets/images/illustrations/placeholders/flat/placeholder-search-3-dark.svg"
                        alt="No sessions available" />
                    <h3 class="mt-6 text-xl font-bold text-gray-900 dark:text-gray-100">{{ t('live-session.no-sessions')
                    }}</h3>
                    <p class="mt-2 text-base text-gray-500 dark:text-gray-400">
                        {{ t('live-session.no-sessions-description') }}
                    </p>
                    <div class="mt-8">
                        <Button color="primary" iconName="IconPlay" :label="t('live-session.start-first-session')"
                            @click="goToBundles" class="shadow-lg shadow-primary/20" />
                    </div>
                </div>
            </div>

            <!-- Sessions List -->
            <div v-else class="max-w-2xl space-y-4">
                <div v-for="session in sessionList" :key="session._id"
                    class="rounded-xl border border-gray-100 bg-white/60 p-5 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-gray-700 dark:bg-gray-800/60">
                    <NuxtLink :to="`/sessions/${session._id}`" class="block">
                        <!-- Header with Type and Date -->
                        <div class="mb-3 flex items-baseline justify-between">
                            <div class="flex items-center gap-2">
                                <span
                                    class="rounded-lg bg-blue-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
                                    {{ session.type }}
                                </span>
                                <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                                    {{ new Date(session.createdAt).toLocaleString() }}
                                </span>
                            </div>
                            <div
                                class="flex items-center gap-1 text-sm font-semibold text-primary transition-colors group-hover:text-primary-dark">
                                <span> {{ session.dialogs.length || 0 }} {{ t('live-session.dialogs') }} </span>
                                <Icon name="IconChevronRight" class="h-4 w-4" />
                            </div>
                        </div>

                        <!-- Session Metadata -->
                        <div v-if="isPracticeSession(session)"
                            class="mt-3 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <div class="flex items-center gap-1">
                                <span class="font-bold text-gray-400 text-xs uppercase">{{
                                    t('live-session.ai-character') }}:</span>
                                <span class="font-medium text-gray-900 dark:text-gray-100">{{
                                    session.metadata.aiCharacter || '-' }}</span>
                            </div>
                            <div class="flex items-center gap-1">
                                <span class="font-bold text-gray-400 text-xs uppercase">{{
                                    t('live-session.selection-mode') }}:</span>
                                <span class="font-medium capitalize text-gray-900 dark:text-gray-100">{{
                                    session.metadata.selectionMode || '-' }}</span>
                            </div>
                            <div v-if="session.session.totalPhrases">
                                <span class="font-bold text-gray-400 text-xs uppercase">{{
                                    t('live-session.total-phrases') }}:</span>
                                <span class="font-medium text-gray-900 dark:text-gray-100">{{
                                    session.metadata.totalPhrases || '-' }}</span>
                            </div>
                            <div v-if="session.metadata.selectionMode === 'selection'">
                                <span class="font-bold text-gray-400 text-xs uppercase">{{
                                    t('live-session.phrase-range') }}:</span>
                                <span class="font-medium text-gray-900 dark:text-gray-100">{{
                                    session.metadata.fromPhrase || '-' }} - {{ session.metadata.toPhrase || '-'
                                    }}</span>
                            </div>
                        </div>
                    </NuxtLink>
                </div>
            </div>

            <!-- Pagination -->
            <div v-if="pagination && !isEmptyState" class="mt-8 max-w-2xl flex justify-center">
                <Pagination v-model="controller.pagination.page" :totalPages="controller.pagination.pages"
                    @change-page="controller.fetchPage($event)" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Icon, Button } from '@codebridger/lib-vue-components/elements.ts';
import { Pagination } from '@codebridger/lib-vue-components/complex.ts';
import PageHeader from '~/components/common/PageHeader.vue';
import { dataProvider } from '@modular-rest/client';
import type { PaginationType } from '@modular-rest/client/dist/types/types';
import { COLLECTIONS, DATABASE } from '~/types/database.type';
import type { LiveSessionRecordType, LivePracticeSessionSetupType } from '~/types/live-session.type';

const { t } = useI18n();
const router = useRouter();

definePageMeta({
    layout: 'default',
    title: () => t('live-session.session-history'),
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
            // dialogs: { $elemMatch: { speaker: 'user' } },
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

    try {
        // update pagination
        await controller.updatePagination();
        // fetch first page
        await controller.fetchPage(1);
    } catch (error) {
        isLoading.value = false;
    }
});

function goToBundles() {
    router.push('/bundles');
}
</script>
