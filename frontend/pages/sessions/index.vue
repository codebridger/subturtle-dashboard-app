<template>
    <div class="p-4">
        <!-- Left section -->
        <div class="mb-4 flex items-center justify-between gap-4">
            <div>
                <Input iconName="IconSearch" v-model="filter" :placeholder="t('session.filter_sessions')" :error="!!error" :error-message="error || ''" />
            </div>
        </div>

        <!-- Sessions List -->
        <div class="space-y-4">
            <div v-for="session in sessionList" :key="session._id" class="rounded-lg bg-white p-4 shadow transition-shadow hover:shadow-md dark:bg-gray-800">
                <NuxtLink :to="`/sessions/${session._id}`" class="block">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="flex gap-1 text-lg font-semibold">
                                <span class="rounded-lg bg-blue-100 p-1 text-xs uppercase text-blue-600 dark:bg-blue-900 dark:text-blue-400">{{
                                    session.type
                                }}</span>
                            </h3>
                            <p class="text-sm text-gray-600 dark:text-gray-400">
                                {{ new Date(session.createdAt).toLocaleString() }}
                            </p>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-gray-600 dark:text-gray-400"> {{ session.dialogCount || 0 }} messages </span>
                            <Icon name="IconChevronRight" class="h-5 w-5" />
                        </div>
                    </div>
                </NuxtLink>
            </div>
        </div>

        <!-- Pagination -->
        <div v-if="pagination" class="mt-6">
            <Pagination v-model="controller.pagination.page" :totalPages="controller.pagination.pages" @change-page="controller.fetchPage($event)" />
        </div>
    </div>
</template>

<script setup lang="ts">
    import { Input } from '@codebridger/lib-vue-components/elements.ts';
    import { Pagination } from '@codebridger/lib-vue-components/complex.ts';
    import { dataProvider } from '@modular-rest/client';
    import type { PaginationType } from '@modular-rest/client/dist/types/types';
    import { COLLECTIONS, DATABASE } from '~/types/database.type';

    const { t } = useI18n();

    const error = ref<string | null>(null);

    definePageMeta({
        layout: 'default',
        title: () => t('session.history'),
        middleware: ['auth'],
    });

    const filter = ref('');
    const perPage = ref(20);
    const sessionList = ref<any[]>([]);
    const pagination = ref<PaginationType | null>(null);

    const controller = dataProvider.list(
        {
            database: DATABASE.USER_CONTENT,
            collection: COLLECTIONS.LIVE_SESSION,
            query: {
                refId: authUser.value?.id,
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
        await controller.updatePagination();
        controller.fetchPage(1);
    });
</script>
